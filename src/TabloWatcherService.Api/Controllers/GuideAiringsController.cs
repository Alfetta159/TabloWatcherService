// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/guide-airings")]
// public class GuideAiringsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[], GuideAirings>(clientFactory)
// {
//     protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetGuideAiringsAsync();

//     protected override Task<ApiResponse<IDictionary<string, GuideAirings[]>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
