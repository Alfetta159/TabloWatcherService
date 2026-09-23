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
    ITabloDeviceClientFactory clientFactory) : ICurrentTabloDeviceResolver
{
    // The association server's cached "http" port for a device can be stale (see
    // ServerInfoController history); 8885 is the Tablo local API's actual port.
    private const int DevicePort = 8885;

    public async Task<ITabloDeviceClient?> ResolveAsync()
    {
        var recordersResponse = await associationServerClient.GetRecordersAsync();
        var recorder = recordersResponse.IsSuccessStatusCode
            ? recordersResponse.Content?.Recorders.FirstOrDefault()
            : null;

        return recorder is null ? null : clientFactory.Create(recorder.PrivateIp, DevicePort);
    }
}
