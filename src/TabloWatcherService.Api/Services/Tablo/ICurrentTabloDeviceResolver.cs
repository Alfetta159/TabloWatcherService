namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Resolves a client for "the" Tablo device - the first one the association server knows
/// about. Used by features scoped to a single device (the guide grid and its images),
/// mirroring how the frontend picks a default server before the user chooses otherwise.
/// </summary>
public interface ICurrentTabloDeviceResolver
{
    Task<ITabloDeviceClient?> ResolveAsync();
}

public class CurrentTabloDeviceResolver(
    IAssociationServerClient associationServerClient,
    ITabloDeviceClientFactory clientFactory,
    ILogger<CurrentTabloDeviceResolver> logger) : ICurrentTabloDeviceResolver
{
    // The association server's cached "http" port for a device can be stale (see
    // ServerInfoController history); 8885 is the Tablo local API's actual port.
    private const int DevicePort = 8885;

    // The association server rate-limits (429) aggressively; a device's private IP rarely
    // changes, so the last one seen is a better answer than none when the lookup fails.
    private string? _lastKnownIp;

    // Callers like ImagesController resolve once per request, and a page of posters is dozens
    // of requests - re-asking the association server for each burns through its rate limit
    // (starving the frontend's own /api/servers call), so reuse a recent answer.
    private static readonly TimeSpan LookupCacheDuration = TimeSpan.FromMinutes(5);
    private DateTimeOffset _lastLookup = DateTimeOffset.MinValue;

    public async Task<ITabloDeviceClient?> ResolveAsync()
    {
        if (_lastKnownIp is not null && DateTimeOffset.UtcNow - _lastLookup < LookupCacheDuration)
        {
            return clientFactory.Create(_lastKnownIp, DevicePort);
        }

        var recordersResponse = await associationServerClient.GetRecordersAsync();
        if (recordersResponse.IsSuccessStatusCode)
        {
            _lastKnownIp = recordersResponse.Content?.Recorders.FirstOrDefault()?.PrivateIp;
            _lastLookup = DateTimeOffset.UtcNow;
            if (_lastKnownIp is null)
            {
                logger.LogWarning("The association server returned no Tablo servers");
            }
        }
        else
        {
            logger.LogWarning(
                "Association server lookup failed ({Status}); {Fallback}",
                recordersResponse.StatusCode,
                _lastKnownIp is null ? "no previously known device to fall back to" : $"falling back to {_lastKnownIp}");
        }

        return _lastKnownIp is null ? null : clientFactory.Create(_lastKnownIp, DevicePort);
    }
}
