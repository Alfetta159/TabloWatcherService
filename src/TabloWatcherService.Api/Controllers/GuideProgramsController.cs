using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/guide-programs")]
public class GuideProgramsController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetGuideProgramsAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
