namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Resolves a client for "the" Tablo device - the first online one, by name. Used by features
/// scoped to a single device (the guide grid and its images), mirroring how the frontend
/// picks a default server before the user chooses otherwise.
/// </summary>
public interface ICurrentTabloDeviceResolver
{
    Task<ITabloDeviceClient?> ResolveAsync();
}

public class CurrentTabloDeviceResolver(
    ITabloDeviceDiscovery deviceDiscovery,
    ITabloDeviceClientFactory clientFactory,
    ILogger<CurrentTabloDeviceResolver> logger) : ICurrentTabloDeviceResolver
{
    // Discovery caches its answer briefly, so the dozens of resolves behind a page of posters
    // don't each re-probe the devices or hit the association server's rate limit.
    public async Task<ITabloDeviceClient?> ResolveAsync()
    {
        var device = (await deviceDiscovery.GetOnlineDevicesAsync()).Devices.FirstOrDefault();
        if (device is null)
        {
            logger.LogWarning("No Tablo device is online");
            return null;
        }

        return clientFactory.Create(device.PrivateIp, TabloDeviceDiscovery.DevicePort);
    }
}
