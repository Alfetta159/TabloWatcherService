using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/guide-channels")]
public class GuideChannelsController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetGuideChannelsAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }

    [HttpGet("{channelId:int}")]
    public async Task<IActionResult> GetById(int channelId)
    {
        var response = await tabloDeviceClient.GetGuideChannelAsync(channelId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
