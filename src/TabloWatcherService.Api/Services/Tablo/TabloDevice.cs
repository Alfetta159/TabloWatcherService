using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Everything this service keeps for one Tablo: its guide and recordings caches, channel list
/// and keyword recordings. Each device has its own, so switching devices in the UI shows that
/// device's data straight away rather than waiting on a minutes-long re-read - and the
/// background refreshes (see <see cref="PerDeviceRefreshService"/>) keep every online
/// device's copy current.
/// <para>
/// HTTP requests reach the selected device's through the usual interfaces (IAiringsStore,
/// IRecordingsStore, ...), registered per request from <see cref="CurrentTabloDevice"/>.
/// </para>
/// </summary>
public sealed class TabloDevice
{
    private volatile Recorder _recorder;
    private readonly ITabloDeviceClientFactory? _clientFactory;

    internal TabloDevice(Recorder recorder, ITabloDeviceClientFactory? clientFactory)
    {
        _recorder = recorder;
        _clientFactory = clientFactory;
    }

    /// <summary>The association server's id for the device, e.g. "SID_5087B83082EA".</summary>
    public string ServerId => _recorder.Serverid;

    public string Name => _recorder.Name;

    /// <summary>False for <see cref="ITabloDeviceRegistry.None"/>, the stand-in while no device is online.</summary>
    public bool IsReal => _clientFactory is not null;

    public required IAiringsStore Airings { get; init; }
    public required IRecordingsStore Recordings { get; init; }
    public required IDeviceChannels Channels { get; init; }
    public required IKeywordRulesStore KeywordRules { get; init; }
    public required KeywordRecordingService KeywordRecordings { get; init; }

    /// <summary>A client for the device's local API at its latest known IP; null for <see cref="ITabloDeviceRegistry.None"/>.</summary>
    public ITabloDeviceClient? CreateClient() =>
        _clientFactory?.Create(_recorder.PrivateIp, TabloDeviceDiscovery.DevicePort);

    // A device's private IP can change (DHCP); the registry passes along the latest listing.
    internal void Update(Recorder recorder) => _recorder = recorder;
}

/// <summary>The <see cref="TabloDevice"/> for each Tablo, created the first time it's seen.</summary>
public interface ITabloDeviceRegistry
{
    /// <summary>The devices that are online right now (see <see cref="ITabloDeviceDiscovery"/>), ordered by name.</summary>
    Task<IReadOnlyList<TabloDevice>> GetOnlineAsync(CancellationToken cancellationToken = default);

    /// <summary>Empty stores and no client - what a request gets while no device is online.</summary>
    TabloDevice None { get; }
}

public class TabloDeviceRegistry : ITabloDeviceRegistry
{
    private readonly ITabloDeviceDiscovery _discovery;
    private readonly ITabloDeviceClientFactory _clientFactory;
    private readonly IHostEnvironment _environment;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<TabloDeviceRegistry> _logger;
    private readonly Lock _lock = new();
    private readonly Dictionary<string, TabloDevice> _devices = [];
    private bool _legacyRulesChecked;

    public TabloDeviceRegistry(
        ITabloDeviceDiscovery discovery,
        ITabloDeviceClientFactory clientFactory,
        IHostEnvironment environment,
        ILoggerFactory loggerFactory)
    {
        _discovery = discovery;
        _clientFactory = clientFactory;
        _environment = environment;
        _loggerFactory = loggerFactory;
        _logger = loggerFactory.CreateLogger<TabloDeviceRegistry>();
        None = Create(new Recorder(), clientFactory: null);
    }

    public TabloDevice None { get; }

    public async Task<IReadOnlyList<TabloDevice>> GetOnlineAsync(CancellationToken cancellationToken = default)
    {
        var result = await _discovery.GetOnlineDevicesAsync(cancellationToken);
        lock (_lock)
        {
            if (!_legacyRulesChecked && result.KnownDevices is { Count: > 0 } known)
            {
                MoveLegacyKeywordRules(known);
                _legacyRulesChecked = true;
            }

            return [.. result.Devices.Select(GetOrAdd)];
        }
    }

    // Callers hold _lock.
    private TabloDevice GetOrAdd(Recorder recorder)
    {
        if (_devices.TryGetValue(recorder.Serverid, out var device))
        {
            device.Update(recorder);
            return device;
        }

        device = Create(recorder, _clientFactory);
        _devices[recorder.Serverid] = device;
        return device;
    }

    private TabloDevice Create(Recorder recorder, ITabloDeviceClientFactory? clientFactory)
    {
        var deviceId = clientFactory is null ? null : recorder.Serverid;
        var airings = new AiringsStore(_environment, deviceId);
        var keywordRules = new KeywordRulesStore(_environment, deviceId);

        // The per-device services reach the device through this, so they always talk to the
        // one they belong to (at its latest IP) - never "whichever device is selected".
        TabloDevice? device = null;
        var resolver = new FixedTabloDeviceResolver(() => device!.CreateClient());

        device = new TabloDevice(recorder, clientFactory)
        {
            Airings = airings,
            Recordings = new RecordingsStore(_environment, deviceId),
            Channels = new DeviceChannels(resolver, _loggerFactory.CreateLogger<DeviceChannels>()),
            KeywordRules = keywordRules,
            KeywordRecordings = new KeywordRecordingService(
                keywordRules, airings, resolver, _loggerFactory.CreateLogger<KeywordRecordingService>()),
        };
        return device;
    }

    /// <summary>
    /// Keyword recordings used to be one list, scheduled on "the" device - the first by name
    /// whenever it was online. Gives that list to that device, before its store first loads.
    /// </summary>
    private void MoveLegacyKeywordRules(IReadOnlyList<Recorder> knownDevices)
    {
        var legacyPath = Path.Combine(_environment.ContentRootPath, KeywordRulesStore.LegacyFileName);
        if (!File.Exists(legacyPath))
        {
            return;
        }

        var target = knownDevices[0];
        var targetPath = KeywordRulesStore.FilePathFor(_environment, target.Serverid);
        if (File.Exists(targetPath))
        {
            _logger.LogWarning(
                "Not moving {Legacy} to {Target}: that file already exists. Rules in {Legacy} are no longer used.",
                legacyPath, targetPath, legacyPath);
            return;
        }

        try
        {
            File.Move(legacyPath, targetPath);
            _logger.LogInformation(
                "Moved keyword recordings from {Legacy} to {Target}, for {Name} - the device they were scheduling on",
                legacyPath, targetPath, target.Name);
        }
        catch (IOException ex)
        {
            _logger.LogError(ex, "Couldn't move keyword recordings from {Legacy} to {Target}", legacyPath, targetPath);
        }
    }
}

/// <summary>
/// The device the current HTTP request is for, set by <see cref="TabloDeviceSelectionMiddleware"/>:
/// the one the browser selected (the X-Tablo-Device header, or a "device" query parameter where a
/// header can't be sent, like an &lt;img&gt; src) if it's online, otherwise the first online one.
/// </summary>
public sealed class CurrentTabloDevice(ITabloDeviceRegistry registry)
{
    public TabloDevice Device { get; internal set; } = registry.None;
}

public sealed class TabloDeviceSelectionMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Tablo-Device";
    public const string QueryName = "device";

    public async Task InvokeAsync(HttpContext context, ITabloDeviceRegistry registry, CurrentTabloDevice current)
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            var requested = context.Request.Headers[HeaderName].FirstOrDefault()
                ?? context.Request.Query[QueryName].FirstOrDefault();
            var online = await registry.GetOnlineAsync(context.RequestAborted);
            current.Device = online.FirstOrDefault(d => d.ServerId == requested)
                ?? online.FirstOrDefault()
                ?? registry.None;
        }

        await next(context);
    }
}
