using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/guide-shows")]
public class GuideShowsController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetGuideShowsAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
