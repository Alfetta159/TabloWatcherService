using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-series")]
public class GuideSeriesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[],GuideSeries>(clientFactory)
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

    protected override Task<ApiResponse<IDictionary<string, GuideSeries>>> PostBatchAsync(ITabloDeviceClient client, IEnumerable<string> paths)
    {
        throw new NotImplementedException();
    }
}
