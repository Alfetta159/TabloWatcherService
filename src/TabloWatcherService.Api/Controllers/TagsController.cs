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
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        allTags = airingsStore.GetAllGenres(),
        blockedTags = blockedTagsStore.Get(),
    });

    [HttpPut("blocked")]
    public IActionResult SetBlocked([FromBody] string[] tags)
    {
        blockedTagsStore.Set(tags);
        return Ok(new { blockedTags = blockedTagsStore.Get() });
    }
}
