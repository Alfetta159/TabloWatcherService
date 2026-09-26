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
public class SearchController(IAiringsStore store, IBlockedTagsStore blockedTags) : ControllerBase
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
}
