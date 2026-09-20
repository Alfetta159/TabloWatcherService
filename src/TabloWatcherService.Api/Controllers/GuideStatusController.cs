using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-status")]
public class GuideStatusController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<GuideStatus>(clientFactory)
{
    protected override Task<ApiResponse<GuideStatus>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideStatusAsync();
}
