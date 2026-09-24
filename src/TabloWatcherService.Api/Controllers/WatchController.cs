using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Starts a live stream for a channel. The frontend plays the returned playlist_url
/// directly against the device (see <see cref="ITabloDeviceClient.WatchChannelAsync"/>) -
/// this endpoint only brokers the device call that allocates the tuner, and reports which
/// tuner that was.
/// </summary>
[ApiController]
[Route("api/watch")]
public class WatchController(ICurrentTabloDeviceResolver deviceResolver) : ControllerBase
{
    private const int TunerLookupAttempts = 6;
    private static readonly TimeSpan TunerLookupRetryDelay = TimeSpan.FromMilliseconds(500);

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

    // Every tuner currently on a channel - whether this app, another Tablo client or a
    // recording put it there - as 1-based tuner number and channel object id. Idle tuners
    // (and ones mid-tune, in_use with no channel yet) are left out.
    [HttpGet("tuners")]
    public async Task<IActionResult> GetTuners()
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return NotFound();
        }

        var tuners = await client.GetTunersAsync();
        if (!tuners.IsSuccessStatusCode || tuners.Content is null)
        {
            return tuners.ToErrorResult();
        }

        var channelsByTuner = tuners.Content
            .Select((tuner, index) => (TunerNumber: index + 1, ChannelId: ChannelIdFromPath(tuner.Channel)))
            .Where(t => t.ChannelId is not null)
            .Select(t => new { tunerNumber = t.TunerNumber, channelObjectId = t.ChannelId });

        return Ok(channelsByTuner);
    }

    private static int? ChannelIdFromPath(string? channelPath) =>
        int.TryParse(channelPath?.Split('/').LastOrDefault(), out var id) ? id : null;

    // The device doesn't say which tuner a watch landed on, but /server/tuners lists each
    // tuner (in tuner order) with the channel it's on. Right after a watch the list can lag
    // (the tuner shows in_use with no channel yet) and the device's embedded server drops
    // the odd request, so poll briefly. Kept separate from Watch so playback isn't delayed.
    [HttpGet("{channelId:int}/tuner")]
    public async Task<IActionResult> GetTuner(int channelId)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return NotFound();
        }

        var channelPath = $"/guide/channels/{channelId}";
        for (var attempt = 0; attempt < TunerLookupAttempts; attempt++)
        {
            if (attempt > 0)
            {
                await Task.Delay(TunerLookupRetryDelay, HttpContext.RequestAborted);
            }

            try
            {
                var tuners = await client.GetTunersAsync();
                if (tuners is { IsSuccessStatusCode: true, Content: not null })
                {
                    var index = Array.FindIndex(tuners.Content, t => t.Channel == channelPath);
                    if (index >= 0)
                    {
                        return Ok(new { tunerNumber = index + 1 });
                    }
                }
            }
            catch (HttpRequestException)
            {
                // Dropped by the device - try again.
            }
        }

        return Ok(new { tunerNumber = (int?)null });
    }
}
