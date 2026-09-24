using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Serves the guide grid (channels x time) built by <see cref="AiringsRefreshService"/>
/// from its in-memory <see cref="IAiringsStore"/> - no live device call per request.
/// </summary>
[ApiController]
[Route("api/guide/grid")]
public class GuideGridController(IAiringsStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Get([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var start = from ?? DateTime.UtcNow;
        var end = to ?? start.AddHours(4);

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            from = start,
            to = end,
            channels = store.GetGrid(start, end),
        });
    }
}
