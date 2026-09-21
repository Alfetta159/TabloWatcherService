// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/hard-drives")]
// public class HardDrivesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<HardDrive[]>(clientFactory)
// {
//     protected override Task<ApiResponse<HardDrive[]>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetHardDrivesAsync();

//     protected override Task<ApiResponse<IDictionary<string, HardDrive[]>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
