using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Starts a live stream for a channel. The frontend plays the returned playlist_url
/// directly against the device (see <see cref="ITabloDeviceClient.WatchChannelAsync"/>) -
/// this endpoint only brokers the device call that allocates the tuner.
/// </summary>
[ApiController]
[Route("api/watch")]
public class WatchController(ICurrentTabloDeviceResolver deviceResolver) : ControllerBase
{
    [HttpPost("{channelId:int}")]
    public async Task<IActionResult> Watch(int channelId)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return NotFound();
        }

        var response = await client.WatchChannelAsync(channelId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
