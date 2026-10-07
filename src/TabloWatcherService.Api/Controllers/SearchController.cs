using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Searches upcoming and in-progress airings - show and episode titles, descriptions and
/// cast - from the same in-memory <see cref="IAiringsStore"/> as the guide grid, so no
/// live device call per request. Results carrying a blocked genre tag (see
/// <see cref="IBlockedTagsStore"/>) are left out entirely, for every caller.
/// </summary>
[ApiController]
[Route("api/search")]
public class SearchController(IAiringsStore store, IRecordingsStore recordings, IBlockedTagsStore blockedTags)
    : LoggedControllerBase
{
    private const int MaxTermLength = 100;

    // A short, common term ("the") can match most of the guide; the total is still reported
    // so the UI can say there were more.
    private const int MaxResults = 500;

    /// <param name="q">
    /// A single search term, which may contain spaces (e.g. an actor's first and last name).
    /// Leading/trailing whitespace is ignored.
    /// </param>
    [HttpGet]
    public IActionResult Get([FromQuery] string? q)
    {
        var term = q?.Trim() ?? string.Empty;
        if (term.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "A search term (q) is required.");
        }
        if (term.Length > MaxTermLength)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                detail: $"The search term can be at most {MaxTermLength} characters.");
        }

        var blocked = blockedTags.Get();
        var results = store.Search(term, DateTime.UtcNow)
            .Where(r => !r.Genres.Any(blocked.Contains))
            .ToList();

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            query = term,
            totalCount = results.Count,
            results = results.Take(MaxResults),
        });
    }

    /// <summary>
    /// Everything the Search page's detail panel shows for one result: the airing itself,
    /// the series/movie/sport it belongs to (artwork, descriptions, cast, directors), and any
    /// recordings already on the device of the same episode or movie.
    /// </summary>
    /// <param name="path">The airing's guide path, e.g. "/guide/series/episodes/123".</param>
    [HttpGet("details")]
    public IActionResult GetDetails([FromQuery] string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, detail: "An airing path is required.");
        }

        var detailed = store.GetDetailedAiring(path);
        if (detailed is null)
        {
            return LogFailure(NotFound());
        }

        var (airing, series, movie, sport) = detailed;
        var genres = series?.Genres ?? movie?.Genres ?? sport?.Genres ?? [];
        if (genres.Any(blockedTags.Get().Contains))
        {
            return LogFailure(NotFound());
        }

        MovieImage? thumbnail = series?.ThumbnailImage ?? movie?.ThumbnailImage ?? sport?.ThumbnailImage;
        MovieImage? cover = series?.CoverImage ?? movie?.CoverImage ?? sport?.CoverImage;
        MovieImage? background = series?.BackgroundImage ?? movie?.BackgroundImage ?? sport?.BackgroundImage;
        var homeTeamId = airing.Event?.HomeTeamId;

        return Ok(new
        {
            airing = UpcomingResponses.Airing(airing),
            title = airing.AiringDetails.ShowTitle,
            episodeTitle = airing.Episode?.Title is { Length: > 0 } t ? t : airing.Event?.Title,
            seasonNumber = airing.Episode?.SeasonNumber is > 0 ? airing.Episode.SeasonNumber : (int?)null,
            episodeNumber = airing.Episode?.Number is > 0 ? airing.Episode.Number : (int?)null,
            // The episode's or game's own description, then the show's/movie's/sport's.
            airingDescription = airing.Episode?.Description is { Length: > 0 } d ? d : airing.Event?.Description,
            description = series?.Description is { Length: > 0 } sd ? sd
                : movie?.Plot is { Length: > 0 } md ? md
                : sport?.Description,
            genres,
            episodeOriginalAirDate = airing.Episode?.OrigAirDate,
            seriesPremiereDate = series?.OrigAirDate,
            releaseYear = movie?.ReleaseYear is > 0 ? movie.ReleaseYear
                : airing.MovieAiring?.ReleaseYear is > 0 ? airing.MovieAiring.ReleaseYear
                : (int?)null,
            rating = movie?.FilmRating is { Length: > 0 } fr ? fr
                : airing.MovieAiring?.FilmRating is { Length: > 0 } afr ? afr
                : series?.SeriesRating is { Length: > 0 } sr ? sr
                : null,
            starRating = StarRatings.FromQualityRating(movie?.QualityRating ?? airing.MovieAiring?.QualityRating),
            // Seconds: the show's/movie's own runtime, as opposed to the airing's time slot.
            runtime = movie?.OriginalRuntime is > 0 ? movie.OriginalRuntime
                : series?.EpisodeRuntime is > 0 ? series.EpisodeRuntime
                : (int?)null,
            cast = series?.Cast ?? movie?.Cast ?? [],
            directors = movie?.Directors ?? [],
            venue = airing.Event?.Venue,
            teams = (airing.Event?.Teams ?? []).Select(team => new { name = team.Name, isHome = team.TeamId == homeTeamId }),
            thumbnailImageId = thumbnail?.ImageId,
            coverImageId = cover?.ImageId,
            backgroundImageId = background?.ImageId,
            recordings = RecordingsOf(airing).Select(r => new
            {
                path = r.Path,
                datetime = r.AiringDetails.Datetime,
                state = r.VideoDetails?.State,
                // Bytes and seconds actually recorded.
                size = r.VideoDetails?.Size,
                duration = r.VideoDetails?.Duration,
                width = r.VideoDetails?.Width,
                height = r.VideoDetails?.Height,
                watched = r.UserInfo?.Watched == true,
            }),
        });
    }

    // Recordings of the same episode or movie, newest first, matched on Gracenote's TMS id.
    // "SH" ids identify a whole show rather than one episode (a newscast, or a series airing
    // without episode data), so they'd match every recording of it - those are left out.
    private IEnumerable<RecordedAiring> RecordingsOf(Airing airing)
    {
        var tmsId = airing.Episode?.TmsId is { Length: > 0 } e ? e : airing.MovieAiring?.TmsId;
        if (string.IsNullOrEmpty(tmsId) || tmsId.StartsWith("SH", StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        return recordings.Recordings.Values
            .Where(r => (r.Episode?.TmsId ?? r.MovieAiring?.TmsId) == tmsId)
            .OrderByDescending(r => r.AiringDetails.Datetime);
    }
}
