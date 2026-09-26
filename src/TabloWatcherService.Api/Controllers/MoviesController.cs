using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Lists the movies coming up in the guide, alphabetically, from the same in-memory
/// <see cref="IAiringsStore"/> as the guide grid - no live device call per request. Movies
/// carrying a blocked genre tag (see <see cref="IBlockedTagsStore"/>) are left out entirely,
/// for every caller.
/// </summary>
[ApiController]
[Route("api/movies")]
public class MoviesController(IAiringsStore store, IBlockedTagsStore blockedTags) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var blocked = blockedTags.Get();

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            items = store.GetUpcomingMovies(DateTime.UtcNow)
                .Where(m => !(m.Details?.Genres ?? []).Any(blocked.Contains))
                .Select(m => new
                {
                    path = m.Path,
                    title = m.Title,
                    description = m.Details?.Plot,
                    genres = m.Details?.Genres ?? [],
                    releaseYear = m.Details?.ReleaseYear is > 0 ? m.Details.ReleaseYear : (int?)null,
                    filmRating = m.Details?.FilmRating,
                    starRating = StarRatings.FromQualityRating(m.Details?.QualityRating),
                    // Image ids for GET /api/images/{id}; the thumbnail is the portrait poster.
                    thumbnailImageId = m.Details?.ThumbnailImage?.ImageId,
                    coverImageId = m.Details?.CoverImage?.ImageId,
                    backgroundImageId = m.Details?.BackgroundImage?.ImageId,
                    channels = m.Channels.Select(UpcomingResponses.Channel),
                    // "scheduled"/"conflict" if any upcoming airing is, for the card's pill.
                    recordingState = AiringSchedule.Summarize(m.Airings),
                }),
        });
    }

    /// <summary>
    /// One movie's full details and every upcoming airing, with whether each is set to
    /// record - for the Movies page's detail dialog.
    /// </summary>
    [HttpGet("{movieId:int}")]
    public IActionResult GetById(int movieId)
    {
        var movie = store.GetUpcomingMovie($"/guide/movies/{movieId}", DateTime.UtcNow);
        if (movie is null)
        {
            return NotFound();
        }

        var details = movie.Details;
        return Ok(new
        {
            path = movie.Path,
            title = movie.Title,
            description = details?.Plot,
            genres = details?.Genres ?? [],
            releaseYear = details?.ReleaseYear is > 0 ? details.ReleaseYear : (int?)null,
            filmRating = details?.FilmRating,
            starRating = StarRatings.FromQualityRating(details?.QualityRating),
            runtime = details?.OriginalRuntime is > 0 ? details.OriginalRuntime : (int?)null,
            cast = details?.Cast ?? [],
            directors = details?.Directors ?? [],
            thumbnailImageId = details?.ThumbnailImage?.ImageId,
            coverImageId = details?.CoverImage?.ImageId,
            backgroundImageId = details?.BackgroundImage?.ImageId,
            recordingState = AiringSchedule.Summarize(movie.Airings),
            airings = movie.Airings.Select(UpcomingResponses.Airing),
        });
    }
}
