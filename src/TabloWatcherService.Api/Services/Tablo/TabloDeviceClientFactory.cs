namespace TabloWatcherService.Api.Services.Tablo;

public class TabloDeviceClientFactory(IHttpClientFactory httpClientFactory, RefitSettings refitSettings) : ITabloDeviceClientFactory
{
    public ITabloDeviceClient Create(string ipAddress, int port = 8885)
    {
        var httpClient = httpClientFactory.CreateClient(nameof(ITabloDeviceClient));
        httpClient.BaseAddress = new Uri($"http://{ipAddress}:{port}");

        // RestService.For<T> uses Refit's reflection-based request builder by default, which
        // requires the separate Refit.Reflection package (Refit 16 generates the client
        // implementation at compile time instead - see ITabloDeviceClient's [Get]-attributed
        // methods). ForGenerated uses that compile-time-generated implementation instead.
        return RestService.ForGenerated<ITabloDeviceClient>(httpClient, refitSettings);
    }
}
