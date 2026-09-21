// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/update-info")]
// public class UpdateInfoController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<UpdateInfo>(clientFactory)
// {
//     protected override Task<ApiResponse<UpdateInfo>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetUpdateInfoAsync();

//     protected override Task<ApiResponse<IDictionary<string, UpdateInfo>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
