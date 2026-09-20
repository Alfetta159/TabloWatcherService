using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-series")]
public class GuideSeriesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[]>(clientFactory)
{
    protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideSeriesAsync();

    [HttpGet("{seriesId:int}")]
    public async Task<IActionResult> GetById(int seriesId, [FromQuery] string ip, [FromQuery] int port = 8885)
    {
        var client = ClientFactory.Create(ip, port);
        var response = await client.GetGuideSeriesByIdAsync(seriesId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
