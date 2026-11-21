namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Resolves a client for "the" Tablo device. In an HTTP request that's the device the browser
/// selected (see <see cref="CurrentTabloDevice"/>); inside a device's own services (its channel
/// list, keyword recordings) it's always that device (<see cref="FixedTabloDeviceResolver"/>).
/// </summary>
public interface ICurrentTabloDeviceResolver
{
    Task<ITabloDeviceClient?> ResolveAsync();
}

/// <summary>The selected device for the current request; registered per request.</summary>
public class CurrentTabloDeviceResolver(CurrentTabloDevice current, ILogger<CurrentTabloDeviceResolver> logger) : ICurrentTabloDeviceResolver
{
    public Task<ITabloDeviceClient?> ResolveAsync()
    {
        var client = current.Device.CreateClient();
        if (client is null)
        {
            logger.LogWarning("No Tablo device is online");
        }

        return Task.FromResult(client);
    }
}

/// <summary>Always the same device - for the services that belong to one (see <see cref="TabloDevice"/>).</summary>
public class FixedTabloDeviceResolver(Func<ITabloDeviceClient?> createClient) : ICurrentTabloDeviceResolver
{
    public Task<ITabloDeviceClient?> ResolveAsync() => Task.FromResult(createClient());
}
