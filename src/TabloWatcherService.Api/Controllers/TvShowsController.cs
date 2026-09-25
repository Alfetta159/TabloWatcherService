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
    public IActionResult Get()
    {
        var shows = store.GetUpcomingSeries(DateTime.UtcNow);

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            shows = shows.Select(s => new
            {
                path = s.Path,
                title = s.Title,
                description = s.Series?.Description,
                genres = s.Series?.Genres ?? [],
                seriesRating = s.Series?.SeriesRating,
                // Image ids for GET /api/images/{id}; the thumbnail is the portrait poster.
                thumbnailImageId = s.Series?.ThumbnailImage?.ImageId,
                coverImageId = s.Series?.CoverImage?.ImageId,
                backgroundImageId = s.Series?.BackgroundImage?.ImageId,
                channels = s.Channels.Select(c => new
                {
                    objectId = c.Channel.ObjectId,
                    callSign = c.Channel.Channel.CallSign,
                    network = c.Channel.Channel.Network,
                    major = c.Channel.Channel.Major,
                    minor = c.Channel.Channel.Minor,
                    nextAiring = c.NextAiring,
                    airingCount = c.AiringCount,
                }),
            }),
        });
    }
}
