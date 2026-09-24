// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/guide-status")]
// public class GuideStatusController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[],GuideStatus>(clientFactory)
// {
//     protected override Task<ApiResponse<GuideStatus>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetGuideStatusAsync();

//     protected override Task<ApiResponse<IDictionary<string, GuideStatus>>> PostBatchAsync(ITabloDeviceClient client, IEnumerable<string> paths)
//     {
//         throw new NotImplementedException();
//     }
// }
