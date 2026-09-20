using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/guide-series-seasons")]
public class SeriesSeasonsController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet("{seasonId:int}")]
    public async Task<IActionResult> GetById(int seasonId)
    {
        var response = await tabloDeviceClient.GetSeriesSeasonAsync(seasonId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
