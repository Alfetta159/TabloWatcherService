using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// One upcoming airing covered by a recording (scheduled, in conflict or skipped), with what
/// a card or row needs to show it - shared by the Recordings page's Scheduled tab and the
/// Scheduled page.
/// </summary>
internal static class ScheduleResponses
{
    public static object Item(ScheduledAiring s)
    {
        var airing = s.Airing;
        var images = (s.Series?.ThumbnailImage, s.Series?.CoverImage, s.Series?.BackgroundImage);
        if (s.Movie is { } movie) images = (movie.ThumbnailImage, movie.CoverImage, movie.BackgroundImage);
        if (s.Sport is { } sport) images = (sport.ThumbnailImage, sport.CoverImage, sport.BackgroundImage);

        return new
        {
            key = airing.Path,
            path = airing.Path,
            kind = airing.Event is not null ? RecordingKinds.Sport
                : airing.MoviePath is not null ? RecordingKinds.Movie
                : airing.SeriesPath is not null ? RecordingKinds.TvShow
                : RecordingKinds.Program,
            title = airing.AiringDetails.ShowTitle,
            // The episode ("S20E1 · Ultimate Table Saw Upgrade"), game or movie's year.
            subtitle = EpisodeLabel(airing.Episode) ?? airing.Event?.Title
                ?? (airing.MovieAiring?.ReleaseYear is > 0 ? airing.MovieAiring.ReleaseYear.ToString() : null),
            description = airing.Episode?.Description ?? airing.Event?.Description ?? s.Movie?.Plot ?? s.Series?.Description,
            genres = s.Series?.Genres ?? s.Movie?.Genres ?? s.Sport?.Genres ?? [],
            thumbnailImageId = images.Item1?.ImageId,
            coverImageId = images.Item2?.ImageId,
            backgroundImageId = images.Item3?.ImageId,
            datetime = airing.AiringDetails.Datetime,
            duration = airing.AiringDetails.Duration,
            live = airing.Qualifiers.Contains("live"),
            isNew = airing.Qualifiers.Contains("new"),
            channel = UpcomingResponses.Channel(airing.AiringDetails.Channel),
            schedule = UpcomingResponses.Schedule(airing.Schedule),
            recordingState = AiringSchedule.Summarize([airing]),
        };
    }

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
