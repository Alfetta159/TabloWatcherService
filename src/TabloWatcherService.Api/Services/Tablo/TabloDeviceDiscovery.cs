using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Which Tablo devices are online right now. The association server says which devices
/// exist and their private IPs, but not whether they're up: a device's <c>last_seen</c> there
/// can go over an hour without updating while it's running fine (and is still recent for a
/// few minutes after it's unplugged). So each device it lists is asked directly, over the
/// LAN, and only the ones that answer count as online.
/// </summary>
public interface ITabloDeviceDiscovery
{
    Task<DeviceDiscoveryResult> GetOnlineDevicesAsync(CancellationToken cancellationToken = default);
}

/// <param name="Devices">The online devices, ordered by name.</param>
/// <param name="AssociationServerFailure">
/// Set only when the association server lookup failed and there was no earlier device list to
/// fall back on - i.e. <paramref name="Devices"/> is empty because nothing is known, not
/// because every device is offline.
/// </param>
public sealed record DeviceDiscoveryResult(IReadOnlyList<Recorder> Devices, IApiResponse? AssociationServerFailure = null);

public class TabloDeviceDiscovery(
    IAssociationServerClient associationServerClient,
    ITabloDeviceClientFactory clientFactory,
    ILogger<TabloDeviceDiscovery> logger) : ITabloDeviceDiscovery
{
    // The association server's cached "http" port for a device can be stale (see
    // ServerInfoController history); 8885 is the Tablo local API's actual port.
    public const int DevicePort = 8885;

    // The device list itself rarely changes, and the association server rate-limits (429)
    // aggressively, so it's re-read far less often than devices are probed.
    private static readonly TimeSpan DeviceListCacheDuration = TimeSpan.FromMinutes(5);

    // Every page of posters resolves the current device dozens of times, and each open
    // browser tab polls /api/servers - one probe round serves them all for this long.
    private static readonly TimeSpan ProbeCacheDuration = TimeSpan.FromSeconds(30);

    // A device on the LAN answers /server/info in well under a second; one that's unplugged
    // never answers, and shouldn't hold up the whole list for HttpClient's 100s default.
    private static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(3);

    private readonly SemaphoreSlim _lock = new(1, 1);
    private Recorder[]? _knownDevices;
    private DateTimeOffset _knownDevicesFetched = DateTimeOffset.MinValue;
    private DeviceDiscoveryResult? _lastResult;
    private DateTimeOffset _lastResultAt = DateTimeOffset.MinValue;
    private HashSet<string> _lastOnlineIds = [];

    public async Task<DeviceDiscoveryResult> GetOnlineDevicesAsync(CancellationToken cancellationToken = default)
    {
        if (_lastResult is { } cached)
        {
            // Stale-while-revalidate: while a device is offline, every probe round waits out
            // its timeout - answering from the last round and re-probing in the background
            // keeps that wait off every caller (a page of posters, the refresh services).
            if (DateTimeOffset.UtcNow - _lastResultAt >= ProbeCacheDuration)
            {
                _ = RefreshInBackgroundAsync();
            }

            return cached;
        }

        // Nothing known yet (first call since startup) - this one has to wait. One probe round
        // at a time; concurrent callers wait for it and share its answer.
        await _lock.WaitAsync(cancellationToken);
        try
        {
            return _lastResult ?? await RefreshAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task RefreshInBackgroundAsync()
    {
        // Already refreshing - that round's answer will do.
        if (!await _lock.WaitAsync(0))
        {
            return;
        }

        try
        {
            if (DateTimeOffset.UtcNow - _lastResultAt >= ProbeCacheDuration)
            {
                await RefreshAsync();
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Background Tablo device discovery failed; keeping the last answer");
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<DeviceDiscoveryResult> RefreshAsync()
    {
        var result = await DiscoverAsync();
        _lastResult = result;
        _lastResultAt = DateTimeOffset.UtcNow;
        return result;
    }

    private async Task<DeviceDiscoveryResult> DiscoverAsync()
    {
        var (devices, failure) = await GetKnownDevicesAsync();
        if (devices is null)
        {
            return new DeviceDiscoveryResult([], failure);
        }

        var probes = devices.Select(async device => (Device: device, Online: await ProbeAsync(device)));
        var online = (await Task.WhenAll(probes))
            .Where(p => p.Online)
            .Select(p => p.Device)
            .OrderBy(d => d.Name)
            .ToArray();

        LogChanges(devices, online);
        return new DeviceDiscoveryResult(online);
    }

    private async Task<(Recorder[]? Devices, IApiResponse? Failure)> GetKnownDevicesAsync()
    {
        if (_knownDevices is not null && DateTimeOffset.UtcNow - _knownDevicesFetched < DeviceListCacheDuration)
        {
            return (_knownDevices, null);
        }

        var response = await associationServerClient.GetRecordersAsync();
        if (response.IsSuccessful)
        {
            _knownDevices = response.Content?.Recorders
                .Where(r => !string.IsNullOrWhiteSpace(r.PrivateIp))
                .ToArray() ?? [];
            _knownDevicesFetched = DateTimeOffset.UtcNow;
            return (_knownDevices, null);
        }

        // A device's private IP rarely changes, so the last list seen is a better answer than
        // none - the probes still decide which of those devices are actually up.
        logger.LogWarning(
            response.Error,
            "Association server lookup failed ({Status}); {Fallback}",
            response.StatusCode,
            _knownDevices is null ? "no previously known devices to fall back to" : "probing the previously known devices");
        return (_knownDevices, _knownDevices is null ? response : null);
    }

    private async Task<bool> ProbeAsync(Recorder device)
    {
        using var timeout = new CancellationTokenSource(ProbeTimeout);
        try
        {
            var response = await clientFactory.Create(device.PrivateIp, DevicePort).GetServerInfoAsync(timeout.Token);
            if (!response.IsSuccessful)
            {
                logger.LogDebug(response.Error, "Tablo {Name} ({Ip}) probe failed ({Status})", device.Name, device.PrivateIp, response.StatusCode);
            }

            return response.IsSuccessful;
        }
        catch (Exception ex) when (ex is OperationCanceledException or HttpRequestException)
        {
            logger.LogDebug(ex, "Tablo {Name} ({Ip}) didn't answer its probe", device.Name, device.PrivateIp);
            return false;
        }
    }

    // Only transitions are logged, so the log shows when a device dropped off or came back
    // without a line per probe round.
    private void LogChanges(Recorder[] known, Recorder[] online)
    {
        var onlineIds = online.Select(d => d.Serverid).ToHashSet();
        foreach (var device in known)
        {
            var isOnline = onlineIds.Contains(device.Serverid);
            if (isOnline != _lastOnlineIds.Contains(device.Serverid))
            {
                logger.LogInformation(
                    "Tablo {Name} ({Ip}) is {State}",
                    device.Name,
                    device.PrivateIp,
                    isOnline ? "online" : "not answering - treating it as offline");
            }
        }

        _lastOnlineIds = onlineIds;
    }
}
