namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Builds an <see cref="ITabloDeviceClient"/> targeting a specific Tablo device. Unlike the
/// association server, a device's local API has no fixed address - its private_ip and http
/// port (from <see cref="IAssociationServerClient"/>'s recorder list) vary per device and
/// per network, so the base address can't be configured once at startup.
/// </summary>
public interface ITabloDeviceClientFactory
{
    ITabloDeviceClient Create(string ipAddress, int port = 8885);
}
