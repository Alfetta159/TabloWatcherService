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
public class RecordingsController(IRecordingsStore recordings, IAiringsStore airings) : ControllerBase
{
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
