using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-channels")]
public class GuideChannelsController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[], GuideChannel>(clientFactory)
{
    protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideChannelsAsync();

    protected override Task<ApiResponse<IDictionary<string, GuideChannel>>> PostBatchAsync(ITabloDeviceClient client, IEnumerable<string> paths) =>
        client.PostBatchAsync<GuideChannel>(paths);

    [HttpGet("{channelId:int}")]
    public async Task<IActionResult> GetById(int channelId, [FromQuery] string ip, [FromQuery] int port = 8885)
    {
        var client = ClientFactory.Create(ip, port);
        var response = await client.GetGuideChannelAsync(channelId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
