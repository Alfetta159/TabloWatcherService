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
                    starRating = StarRating(m.Details?.QualityRating),
                    // Image ids for GET /api/images/{id}; the thumbnail is the portrait poster.
                    thumbnailImageId = m.Details?.ThumbnailImage?.ImageId,
                    coverImageId = m.Details?.CoverImage?.ImageId,
                    backgroundImageId = m.Details?.BackgroundImage?.ImageId,
                    channels = m.Channels.Select(UpcomingResponses.Channel),
                }),
        });
    }

    // The Tablo's quality_rating runs 4-10: Gracenote's 1-4 star critic rating in half-star
    // steps, doubled and offset by 2 (4 = one star, 10 = four). Not documented anywhere -
    // inferred from real guide data, where the 10s are classics like The Searchers and the 4s
    // are the likes of Werewolves on Wheels.
    private static double? StarRating(int? qualityRating) =>
        qualityRating is >= 4 and <= 10 ? (qualityRating.Value - 2) / 2.0 : null;
}
