using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-shows")]
public class GuideShowsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[]>(clientFactory)
{
    protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideShowsAsync();
}
