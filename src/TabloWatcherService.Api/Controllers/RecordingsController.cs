using System.Net;
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

    // The body of an update: which recording, and what to change (null: leave as is).
    public record UpdateRequest(string Path, bool? Watched, bool? Protected);

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
            recordings = group.Recordings.Select(PlayerRecording),
        });
    }

    /// <summary>
    /// A recorded sports event's details and its recording - for the Recordings page's player
    /// dialog, in the same shape as <see cref="GetMovie"/>. Each event is its own group, so
    /// there's only ever the one recording.
    /// </summary>
    [HttpGet("sports/{eventId:int}")]
    public IActionResult GetSportsEvent(int eventId)
    {
        // Matched on the ID alone, not the whole path (presumably /recordings/sports/events/N,
        // but not yet seen on a real device).
        var group = recordings.GetGroups()
            .FirstOrDefault(g => g.Kind == RecordingKinds.Sport && g.Key.EndsWith($"/{eventId}", StringComparison.Ordinal));
        if (group is null)
        {
            return NotFound();
        }

        var sport = group.Sport;
        var latest = group.Recordings[0];
        var sportsEvent = latest.Event;
        return Ok(new
        {
            path = group.Key,
            title = group.Title,
            // The sport or competition ("College Football"), which the title is the game of.
            sport = sport?.Title ?? latest.AiringDetails.ShowTitle,
            description = sportsEvent?.Description ?? sport?.Description,
            venue = sportsEvent?.Venue,
            teams = (sportsEvent?.Teams ?? []).Select(t => new { name = t.Name, isHome = t.TeamId == sportsEvent?.HomeTeamId }),
            genres = sport?.Genres ?? [],
            thumbnailImageId = sport?.ThumbnailImage?.ImageId,
            coverImageId = sport?.CoverImage?.ImageId,
            backgroundImageId = sport?.BackgroundImage?.ImageId,
            recordings = group.Recordings.Select(PlayerRecording),
        });
    }

    /// <summary>
    /// A recorded series' details and every recorded episode, by season - for the Recordings
    /// page's TV show dialog.
    /// </summary>
    [HttpGet("series/{seriesId:int}")]
    public IActionResult GetSeries(int seriesId) => Show($"/recordings/series/{seriesId}");

    /// <summary>
    /// A recorded program (e.g. a local newscast) and every recorded airing of it, in the same
    /// shape as <see cref="GetSeries"/>. Programs have no seasons, so it's all one.
    /// </summary>
    [HttpGet("programs/{programId:int}")]
    public IActionResult GetProgram(int programId) => Show($"/recordings/programs/{programId}");

    private IActionResult Show(string path)
    {
        var group = recordings.GetGroups().FirstOrDefault(g => g.Key == path);
        if (group is null)
        {
            return NotFound();
        }

        var series = group.Series;
        var latest = group.Recordings[0];
        return Ok(new
        {
            path,
            kind = group.Kind,
            title = group.Title,
            description = string.IsNullOrWhiteSpace(series?.Description) ? null : series.Description,
            genres = series?.Genres ?? [],
            seriesRating = string.IsNullOrWhiteSpace(series?.SeriesRating) ? null : series.SeriesRating,
            origAirDate = series?.OrigAirDate,
            episodeRuntime = series?.EpisodeRuntime is > 0 ? series.EpisodeRuntime : (int?)null,
            cast = series?.Cast ?? [],
            thumbnailImageId = series?.ThumbnailImage?.ImageId,
            coverImageId = series?.CoverImage?.ImageId,
            backgroundImageId = series?.BackgroundImage?.ImageId,
            // A frame from the newest recording - the only art a program has.
            snapshotImageId = latest.SnapshotImage?.ImageId,
            // By season, lowest first; episodes without a season number last. Within a season,
            // by episode number, then oldest recording first.
            seasons = group.Recordings
                .GroupBy(r => r.Episode?.SeasonNumber ?? 0)
                .OrderBy(g => g.Key == 0 ? int.MaxValue : g.Key)
                .Select(g => new
                {
                    number = g.Key == 0 ? (int?)null : g.Key,
                    recordings = g
                        .OrderBy(r => r.Episode?.Number is > 0 ? r.Episode.Number : int.MaxValue)
                        .ThenBy(r => r.AiringDetails.Datetime)
                        .Select(ShowRecording),
                }),
        });
    }

    // One recorded episode (or program airing) as the TV show dialog lists it.
    private static object ShowRecording(RecordedAiring r) => new
    {
        path = r.Path,
        recordedAt = r.AiringDetails.Datetime,
        channel = UpcomingResponses.Channel(r.AiringDetails.Channel),
        state = r.VideoDetails?.State,
        duration = r.VideoDetails?.Duration ?? 0,
        size = r.VideoDetails?.Size ?? 0,
        watched = r.UserInfo?.Watched ?? false,
        @protected = r.UserInfo?.Protected ?? false,
        // Where playback last left off, in seconds.
        position = r.UserInfo?.Position ?? 0,
        episodeNumber = r.Episode?.Number is > 0 ? r.Episode.Number : (int?)null,
        title = string.IsNullOrWhiteSpace(r.Episode?.Title) ? null : r.Episode.Title,
        description = string.IsNullOrWhiteSpace(r.Episode?.Description) ? null : r.Episode.Description,
    };

    // One recording as the player dialog lists it.
    private static object PlayerRecording(RecordedAiring r) => new
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
    };

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

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var guidePath = recordings.GuidePathOf(recording);
            var airing = guidePath is null ? null : airings.FindAiring(guidePath, recording.AiringDetails.Datetime);
            if (airing is null)
            {
                // The cache can be behind the device: once the airing is over it drops out of
                // the guide, and the recording has finished on its own.
                return await AlreadyStoppedAsync(client, request.Path)
                    ?? Problem(
                        statusCode: StatusCodes.Status404NotFound,
                        detail: "Couldn't find the guide airing this is being recorded from.");
            }

            var response = await client.SetAiringScheduledAsync(airing.Path.TrimStart('/'), new ScheduleRequest(false));
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                // Likewise: the device has already dropped the airing from its guide.
                return await AlreadyStoppedAsync(client, request.Path) ?? response.ToErrorResult();
            }
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

    // Stop's answer when the recording is no longer being recorded - it finished, or was
    // stopped or deleted elsewhere, since the cache last saw it - after bringing the cache up to
    // date. Null if it's still recording, or the device couldn't say.
    private async Task<IActionResult?> AlreadyStoppedAsync(ITabloDeviceClient client, string path)
    {
        var response = await client.PostBatchAsync<RecordedAiring>([path]);
        if (response is not { IsSuccessStatusCode: true, Content: not null }
            || !response.Content.TryGetValue(path, out var current))
        {
            return null;
        }

        // The batch answers null for a path that no longer exists.
        if (current is null)
        {
            recordings.Remove(path);
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "This recording is no longer on the Tablo.");
        }
        if (current.VideoDetails?.State == "recording")
        {
            return null;
        }

        recordings.Upsert(current);
        return Ok(new { path = current.Path, state = current.VideoDetails?.State });
    }

    /// <summary>
    /// Marks a recording watched/unwatched and/or protected/unprotected (protected recordings
    /// aren't deleted automatically by the series' keep rule). Fields left out stay as they are.
    /// </summary>
    /// <returns>The recording as the TV show dialog lists it, updated.</returns>
    [HttpPatch]
    public async Task<IActionResult> Update([FromBody] UpdateRequest request)
    {
        if (!recordings.Recordings.ContainsKey(request.Path))
        {
            return NotFound();
        }
        if (request.Watched is null && request.Protected is null)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "Nothing to change.");
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        ApiResponse<RecordedAiring> response;
        try
        {
            response = await client.UpdateRecordingAsync(
                request.Path.TrimStart('/'),
                new RecordingUpdate(request.Watched, request.Protected));
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (!response.IsSuccessStatusCode || response.Content is null)
        {
            return response.ToErrorResult();
        }

        recordings.Upsert(response.Content);
        return Ok(ShowRecording(response.Content));
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
