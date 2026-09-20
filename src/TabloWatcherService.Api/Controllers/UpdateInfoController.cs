using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/update-info")]
public class UpdateInfoController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetUpdateInfoAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
