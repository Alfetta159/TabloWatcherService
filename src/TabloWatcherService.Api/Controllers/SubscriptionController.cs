using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SubscriptionController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetSubscriptionAsync();
        if (!response.IsSuccessStatusCode)
        {
            // StatusCode is null when the request never got an HTTP response at all
            // (DNS failure, connection refused, timeout), not just on a non-2xx status.
            return StatusCode(response.StatusCode is { } statusCode ? (int)statusCode : StatusCodes.Status502BadGateway);
        }

        return Ok(response.Content);
    }
}
