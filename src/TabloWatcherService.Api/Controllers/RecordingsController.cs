using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The Recordings page's data: what's been recorded (from <see cref="IRecordingsStore"/>)
/// and what's set to record (from <see cref="IAiringsStore"/>) - both in-memory, no device
/// call per request. The page filters and sorts itself.
/// </summary>
[ApiController]
[Route("api/recordings")]
public class RecordingsController(
    IRecordingsStore recordings,
    IAiringsStore airings,
    ICurrentTabloDeviceResolver deviceResolver) : ControllerBase
{
    // The body of watch/stop/delete: which recording.
    public record WatchRequest(string Path);

    /// <summary>
    /// One item per card: a series or program with all its recorded episodes/airings, or a
    /// single recorded movie or sports event.
    /// </summary>
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        updatedAt = recordings.LastUpdated,
        items = recordings.GetGroups().Select(g =>
        {
            var latest = g.Recordings[0];
            var images = (g.Series?.ThumbnailImage, g.Series?.CoverImage, g.Series?.BackgroundImage);
            if (g.Movie is { } movie) images = (movie.ThumbnailImage, movie.CoverImage, movie.BackgroundImage);
            if (g.Sport is { } sport) images = (sport.ThumbnailImage, sport.CoverImage, sport.BackgroundImage);

            return new
            {
                key = g.Key,
                kind = g.Kind,
                title = g.Title,
                subtitle = Subtitle(g, latest),
                description = g.Series?.Description ?? g.Movie?.Plot ?? latest.Event?.Description ?? latest.Episode?.Description,
                genres = g.Series?.Genres ?? g.Movie?.Genres ?? g.Sport?.Genres ?? [],
                thumbnailImageId = images.Item1?.ImageId,
                coverImageId = images.Item2?.ImageId,
                backgroundImageId = images.Item3?.ImageId,
                // A frame from the newest recording - the only art a program has.
                snapshotImageId = latest.SnapshotImage?.ImageId,
                recordingCount = g.Recordings.Count,
                unwatchedCount = g.Recordings.Count(r => r.UserInfo?.Watched != true),
                // When the newest recording aired - i.e. was recorded.
                latestRecordedAt = latest.AiringDetails.Datetime,
                totalSize = g.Recordings.Sum(r => r.VideoDetails?.Size ?? 0),
                // Any still being recorded right now.
                inProgress = g.Recordings.Any(r => r.VideoDetails?.State == "recording"),
                failedCount = g.Recordings.Count(r => r.VideoDetails?.State == "failed"),
            };
        }),
    });

    /// <summary>Upcoming airings set to record (or in conflict), soonest first.</summary>
    [HttpGet("scheduled")]
    public IActionResult GetScheduled() => Ok(new
    {
        updatedAt = airings.LastUpdated,
        items = airings.GetScheduledAirings(DateTime.UtcNow).Select(ScheduleResponses.Item),
    });

    /// <summary>
    /// A recorded movie's full details and every recording of it (newest first) - for the
    /// Recordings page's movie player dialog.
    /// </summary>
    [HttpGet("movies/{movieId:int}")]
    public IActionResult GetMovie(int movieId)
    {
        var path = $"/recordings/movies/{movieId}";
        var group = recordings.GetGroups().FirstOrDefault(g => g.Key == path);
        if (group is null)
        {
            return NotFound();
        }

        var movie = group.Movie;
        var latest = group.Recordings[0];
        return Ok(new
        {
            path,
            title = group.Title,
            description = movie?.Plot,
            genres = movie?.Genres ?? [],
            releaseYear = movie?.ReleaseYear is > 0 ? movie.ReleaseYear : latest.MovieAiring?.ReleaseYear,
            filmRating = movie?.FilmRating ?? latest.MovieAiring?.FilmRating,
            starRating = StarRatings.FromQualityRating(movie?.QualityRating ?? latest.MovieAiring?.QualityRating),
            runtime = movie?.OriginalRuntime is > 0 ? movie.OriginalRuntime : (int?)null,
            cast = movie?.Cast ?? [],
            directors = movie?.Directors ?? [],
            thumbnailImageId = movie?.ThumbnailImage?.ImageId,
            coverImageId = movie?.CoverImage?.ImageId,
            backgroundImageId = movie?.BackgroundImage?.ImageId,
            recordings = group.Recordings.Select(r => new
            {
                path = r.Path,
                recordedAt = r.AiringDetails.Datetime,
                channel = UpcomingResponses.Channel(r.AiringDetails.Channel),
                state = r.VideoDetails?.State,
                // Seconds actually recorded.
                duration = r.VideoDetails?.Duration ?? 0,
                size = r.VideoDetails?.Size ?? 0,
                width = r.VideoDetails?.Width ?? 0,
                height = r.VideoDetails?.Height ?? 0,
                watched = r.UserInfo?.Watched ?? false,
                // Where playback last left off, in seconds.
                position = r.UserInfo?.Position ?? 0,
                snapshotImageId = r.SnapshotImage?.ImageId,
            }),
        });
    }

    /// <summary>
    /// Starts playback of one recording. The browser plays the returned playlistUrl straight
    /// from the device (see <see cref="ITabloDeviceClient.WatchRecordingAsync"/>).
    /// </summary>
    [HttpPost("watch")]
    public async Task<IActionResult> Watch([FromBody] WatchRequest request)
    {
        // Only ever a recording the cache knows about - never an arbitrary device path.
        if (!recordings.Recordings.ContainsKey(request.Path))
        {
            return NotFound();
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        ApiResponse<WatchInfo> response;
        try
        {
            response = await client.WatchRecordingAsync(request.Path.TrimStart('/'));
        }
        catch (HttpRequestException)
        {
            // The device's embedded server occasionally drops a request; the caller can retry.
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (!response.IsSuccessStatusCode || response.Content is null)
        {
            return response.ToErrorResult();
        }

        return Ok(new { playlistUrl = response.Content.PlaylistUrl });
    }

    /// <summary>
    /// Stops a recording in progress, keeping what's been recorded so far. The device has no
    /// "stop" call as such: this cancels the schedule on the guide airing being recorded (the
    /// same PATCH as <see cref="AiringsController.SetSchedule"/>).
    /// </summary>
    /// <returns>The recording, re-read after stopping.</returns>
    [HttpPost("stop")]
    public async Task<IActionResult> Stop([FromBody] WatchRequest request)
    {
        if (!recordings.Recordings.TryGetValue(request.Path, out var recording))
        {
            return NotFound();
        }
        if (recording.VideoDetails?.State != "recording")
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "This isn't being recorded right now.");
        }

        var guidePath = recordings.GuidePathOf(recording);
        var airing = guidePath is null ? null : airings.FindAiring(guidePath, recording.AiringDetails.Datetime);
        if (airing is null)
        {
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                detail: "Couldn't find the guide airing this is being recorded from.");
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var response = await client.SetAiringScheduledAsync(airing.Path.TrimStart('/'), new ScheduleRequest(false));
            if (!response.IsSuccessStatusCode)
            {
                return response.ToErrorResult();
            }
            if (response.Content?.Schedule is { } schedule)
            {
                airings.UpdateSchedule(airing.Path, schedule);
            }

            // Re-read the recording so the page shows it finished right away.
            var refreshed = await client.PostBatchAsync<RecordedAiring>([request.Path]);
            if (refreshed is { IsSuccessStatusCode: true, Content: not null }
                && refreshed.Content.TryGetValue(request.Path, out var updated) && updated is not null)
            {
                recordings.Upsert(updated);
                recording = updated;
            }
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        return Ok(new { path = recording.Path, state = recording.VideoDetails?.State });
    }

    /// <summary>
    /// Deletes a recording from the device - irreversibly. Refuses one still being recorded
    /// (stop it first).
    /// </summary>
    [HttpPost("delete")]
    public async Task<IActionResult> Delete([FromBody] WatchRequest request)
    {
        if (!recordings.Recordings.TryGetValue(request.Path, out var recording))
        {
            return NotFound();
        }
        if (recording.VideoDetails?.State == "recording")
        {
            return Problem(statusCode: StatusCodes.Status409Conflict, detail: "Stop the recording before deleting it.");
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var response = await client.DeleteRecordingAsync(request.Path.TrimStart('/'));
            if (!response.IsSuccessStatusCode)
            {
                return response.ToErrorResult();
            }
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        recordings.Remove(request.Path);
        return NoContent();
    }

    private static string? Subtitle(RecordingGroup group, RecordedAiring latest) => group.Kind switch
    {
        RecordingKinds.Movie => latest.MovieAiring?.ReleaseYear is > 0 ? latest.MovieAiring.ReleaseYear.ToString() : null,
        RecordingKinds.Sport => group.Sport?.Title ?? latest.AiringDetails.ShowTitle,
        _ => null,
    };
}
