// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/[controller]")]
// public class TunersController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<Tuner[]>(clientFactory)
// {
//     protected override Task<ApiResponse<Tuner[]>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetTunersAsync();

//     protected override Task<ApiResponse<IDictionary<string, Tuner[]>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
