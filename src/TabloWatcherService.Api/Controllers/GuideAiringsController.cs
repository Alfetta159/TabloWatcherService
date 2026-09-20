using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-airings")]
public class GuideAiringsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[]>(clientFactory)
{
    protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideAiringsAsync();
}
