using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The genre tags known from the current guide, and which of them are blocked for everyone
/// (see <see cref="IBlockedTagsStore"/>). TV Shows, Movies and Sports each filter blocked
/// tags out server-side, so this is also how the frontend learns which tags still exist to
/// offer as "show" filters.
/// </summary>
[ApiController]
[Route("api/tags")]
public class TagsController(IAiringsStore airingsStore, IBlockedTagsStore blockedTagsStore) : ControllerBase
{
    // Scoped per content type - e.g. the Sports page shouldn't offer a tag that only ever
    // appears on movies - so this takes the same "kind" the frontend already keys its
    // upcoming-list endpoint by (tv-shows/movies/sports).
    [HttpGet]
    public IActionResult Get([FromQuery] string kind)
    {
        IReadOnlyList<string>? allTags = kind switch
        {
            "tv-shows" => airingsStore.GetSeriesGenres(),
            "movies" => airingsStore.GetMovieGenres(),
            "sports" => airingsStore.GetSportsGenres(),
            _ => null,
        };

        if (allTags is null)
        {
            return BadRequest("kind must be one of: tv-shows, movies, sports");
        }

        return Ok(new { allTags, blockedTags = blockedTagsStore.Get() });
    }

    [HttpPut("blocked")]
    public IActionResult SetBlocked([FromBody] string[] tags)
    {
        blockedTagsStore.Set(tags);
        return Ok(new { blockedTags = blockedTagsStore.Get() });
    }
}
