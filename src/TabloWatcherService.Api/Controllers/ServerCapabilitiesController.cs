// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/server-capabilities")]
// public class ServerCapabilitiesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<ServerCapabilities>(clientFactory)
// {
//     protected override Task<ApiResponse<ServerCapabilities>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetServerCapabilitiesAsync();

//     protected override Task<ApiResponse<IDictionary<string, ServerCapabilities>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
