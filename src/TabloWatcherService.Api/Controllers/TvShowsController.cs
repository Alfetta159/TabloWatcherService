using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Lists the TV shows (series) coming up in the guide, alphabetically, from the same
/// in-memory <see cref="IAiringsStore"/> as the guide grid - no live device call per request.
/// </summary>
[ApiController]
[Route("api/tv-shows")]
public class TvShowsController(IAiringsStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        updatedAt = store.LastUpdated,
        items = store.GetUpcomingSeries(DateTime.UtcNow).Select(s => new
        {
            path = s.Path,
            title = s.Title,
            description = s.Details?.Description,
            genres = s.Details?.Genres ?? [],
            seriesRating = s.Details?.SeriesRating,
            // Image ids for GET /api/images/{id}; the thumbnail is the portrait poster.
            thumbnailImageId = s.Details?.ThumbnailImage?.ImageId,
            coverImageId = s.Details?.CoverImage?.ImageId,
            backgroundImageId = s.Details?.BackgroundImage?.ImageId,
            channels = s.Channels.Select(UpcomingResponses.Channel),
        }),
    });
}
