// using TabloWatcherService.Api.Models;
// using TabloWatcherService.Api.Services.Tablo;

// namespace TabloWatcherService.Api.Controllers;

// [Route("api/[controller]")]
// public class SubscriptionsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<SubscriptionInfo>(clientFactory)
// {
//     protected override Task<ApiResponse<SubscriptionInfo>> GetResponseAsync(ITabloDeviceClient client) =>
//         client.GetSubscriptionAsync();

//     protected override Task<ApiResponse<IDictionary<string, SubscriptionInfo>>> PostBatchAsync(ITabloDeviceClient client)
//     {
//         throw new NotImplementedException();
//     }
// }
