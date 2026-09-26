using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Lists the sports events (individual games, races, tournament days) coming up in the guide,
/// soonest first, from the same in-memory <see cref="IAiringsStore"/> as the guide grid - no
/// live device call per request. Unlike TV shows and movies these aren't grouped: each event
/// is its own airing, and which game it is matters more than which sport. Events whose sport
/// carries a blocked genre tag (see <see cref="IBlockedTagsStore"/>) are left out entirely,
/// for every caller.
/// </summary>
[ApiController]
[Route("api/sports")]
public class SportsController(IAiringsStore store, IBlockedTagsStore blockedTags) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var blocked = blockedTags.Get();

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            items = store.GetUpcomingSportsEvents(DateTime.UtcNow)
                .Where(e => !(e.Sport?.Genres ?? []).Any(blocked.Contains))
                .Select(e =>
                {
                    var airing = e.Airing;
                    var sportTitle = string.IsNullOrWhiteSpace(e.Sport?.Title) ? airing.AiringDetails.ShowTitle : e.Sport.Title;
                    return new
                    {
                        path = airing.Path,
                        // The game (e.g. "Northwestern at Indiana"), or the sport if it has no title of its own.
                        title = string.IsNullOrWhiteSpace(airing.Event?.Title) ? sportTitle : airing.Event.Title,
                        sport = sportTitle,
                        description = airing.Event?.Description,
                        venue = airing.Event?.Venue,
                        live = airing.Qualifiers.Contains("live"),
                        datetime = airing.AiringDetails.Datetime,
                        duration = airing.AiringDetails.Duration,
                        genres = e.Sport?.Genres ?? [],
                        // The sport's artwork - events don't have their own.
                        thumbnailImageId = e.Sport?.ThumbnailImage?.ImageId,
                        coverImageId = e.Sport?.CoverImage?.ImageId,
                        backgroundImageId = e.Sport?.BackgroundImage?.ImageId,
                        channel = UpcomingResponses.Channel(airing.AiringDetails.Channel),
                    };
                }),
        });
    }
}
