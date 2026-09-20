using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/guide-series-seasons")]
public class SeriesSeasonsController(ITabloDeviceClientFactory clientFactory) : ControllerBase
{
    [HttpGet("{seasonId:int}")]
    public async Task<IActionResult> GetById(int seasonId, [FromQuery] string ip, [FromQuery] int port = 8885)
    {
        var client = clientFactory.Create(ip, port);
        var response = await client.GetSeriesSeasonAsync(seasonId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
