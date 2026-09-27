using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The Settings page's Storage tab: the device's hard drives, and what the recordings on
/// them add up to.
/// </summary>
[ApiController]
[Route("api/storage")]
public class StorageController(IRecordingsStore recordings, ICurrentTabloDeviceResolver deviceResolver) : ControllerBase
{
    /// <summary>The device's drives, straight from it (GET /server/harddrives).</summary>
    [HttpGet("hard-drives")]
    public async Task<IActionResult> GetHardDrives()
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var response = await client.GetHardDrivesAsync();
            if (!response.IsSuccessStatusCode)
            {
                return response.ToErrorResult();
            }

            return Ok(response.Content);
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>
    /// Space used by recordings, from the in-memory recordings cache: TV shows by series,
    /// programs by title, movies by title, and sports by their sport's genre tag (Football,
    /// Baseball...) - one slice per game would be too many to read. Biggest first.
    /// </summary>
    [HttpGet("recordings")]
    public IActionResult GetRecordingUsage() => Ok(new
    {
        updatedAt = recordings.LastUpdated,
        items = recordings.GetGroups()
            .GroupBy(g => (g.Kind, Label: g.Kind == RecordingKinds.Sport
                ? g.Sport?.Genres?.FirstOrDefault() ?? g.Sport?.Title ?? "Other sports"
                : g.Title))
            .Select(g => new
            {
                kind = g.Key.Kind,
                label = g.Key.Label,
                size = g.Sum(group => group.Recordings.Sum(r => r.VideoDetails?.Size ?? 0)),
                recordingCount = g.Sum(group => group.Recordings.Count),
                // Each recording, so a movie's or sport's can be picked out to delete. Not
                // for TV - a series can run to hundreds of episodes.
                recordings = g.Key.Kind is RecordingKinds.Movie or RecordingKinds.Sport
                    ? g.SelectMany(group => group.Recordings.Select(r => new
                        {
                            path = r.Path,
                            // The game ("Yankees at Red Sox") or the movie.
                            title = group.Title,
                            // The competition ("MLB Baseball"), or the movie's release year.
                            subtitle = group.Sport?.Title
                                ?? (r.MovieAiring?.ReleaseYear is > 0 ? r.MovieAiring.ReleaseYear.ToString() : null),
                            recordedAt = r.AiringDetails.Datetime,
                            channel = UpcomingResponses.Channel(r.AiringDetails.Channel),
                            state = r.VideoDetails?.State,
                            duration = r.VideoDetails?.Duration ?? 0,
                            size = r.VideoDetails?.Size ?? 0,
                            watched = r.UserInfo?.Watched ?? false,
                        }))
                        .OrderByDescending(r => r.recordedAt)
                        .ToList()
                    : null,
            })
            .Where(item => item.size > 0)
            .OrderByDescending(item => item.size),
    });
}
