// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/guide-shows")]
// public class GuideShowsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[],GuideShow>(clientFactory)
// {
//     protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetGuideShowsAsync();

//     protected override Task<ApiResponse<IDictionary<string, GuideShow>>> PostBatchAsync(ITabloDeviceClient client, IEnumerable<string> paths)
//     {
//         throw new NotImplementedException();
//     }
// }
