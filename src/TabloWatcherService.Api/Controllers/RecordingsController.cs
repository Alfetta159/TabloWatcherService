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
        items = airings.GetScheduledAirings(DateTime.UtcNow).Select(s =>
        {
            var airing = s.Airing;
            var images = (s.Series?.ThumbnailImage, s.Series?.CoverImage, s.Series?.BackgroundImage);
            if (s.Movie is { } movie) images = (movie.ThumbnailImage, movie.CoverImage, movie.BackgroundImage);
            if (s.Sport is { } sport) images = (sport.ThumbnailImage, sport.CoverImage, sport.BackgroundImage);

            return new
            {
                key = airing.Path,
                kind = airing.Event is not null ? RecordingKinds.Sport
                    : airing.MoviePath is not null ? RecordingKinds.Movie
                    : airing.SeriesPath is not null ? RecordingKinds.TvShow
                    : RecordingKinds.Program,
                title = airing.AiringDetails.ShowTitle,
                subtitle = EpisodeLabel(airing.Episode) ?? airing.Event?.Title
                    ?? (airing.MovieAiring?.ReleaseYear is > 0 ? airing.MovieAiring.ReleaseYear.ToString() : null),
                description = airing.Episode?.Description ?? airing.Event?.Description ?? s.Movie?.Plot ?? s.Series?.Description,
                genres = s.Series?.Genres ?? s.Movie?.Genres ?? s.Sport?.Genres ?? [],
                thumbnailImageId = images.Item1?.ImageId,
                coverImageId = images.Item2?.ImageId,
                backgroundImageId = images.Item3?.ImageId,
                datetime = airing.AiringDetails.Datetime,
                duration = airing.AiringDetails.Duration,
                channel = UpcomingResponses.Channel(airing.AiringDetails.Channel),
                recordingState = AiringSchedule.Summarize([airing]),
            };
        }),
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

    private static string? Subtitle(RecordingGroup group, RecordedAiring latest) => group.Kind switch
    {
        RecordingKinds.Movie => latest.MovieAiring?.ReleaseYear is > 0 ? latest.MovieAiring.ReleaseYear.ToString() : null,
        RecordingKinds.Sport => group.Sport?.Title ?? latest.AiringDetails.ShowTitle,
        _ => null,
    };

    // e.g. "S20E1 · Ultimate Table Saw Upgrade"
    private static string? EpisodeLabel(EpisodeInfo? episode)
    {
        if (episode is null)
        {
            return null;
        }

        var parts = new[]
        {
            episode.SeasonNumber > 0 ? $"S{episode.SeasonNumber}E{episode.Number}" : null,
            string.IsNullOrWhiteSpace(episode.Title) ? null : episode.Title,
        };
        var label = string.Join(" · ", parts.OfType<string>());
        return label.Length > 0 ? label : null;
    }
}
