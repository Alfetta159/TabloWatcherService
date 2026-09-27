using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The Scheduled page's data: every upcoming airing a recording covers, from the in-memory
/// guide (<see cref="IAiringsStore"/>) - no device call per request. Recording and
/// cancelling go through <see cref="AiringsController"/>.
/// </summary>
[ApiController]
[Route("api/schedule")]
public class ScheduleController(IAiringsStore airings) : ControllerBase
{
    /// <param name="includeSkipped">
    /// Also list airings a recording rule covers but the device won't record (e.g. already
    /// recorded, or set to record on another channel).
    /// </param>
    [HttpGet]
    public IActionResult Get([FromQuery] bool includeSkipped = false)
    {
        var scheduled = airings.GetScheduledAirings(DateTime.UtcNow, includeSkipped);

        return Ok(new
        {
            updatedAt = airings.LastUpdated,
            // Counted whatever the page shows, so it can warn about conflicts up front.
            conflictCount = scheduled.Count(s => s.Airing.Schedule?.IsConflict == true),
            items = scheduled.Select(ScheduleResponses.Item),
        });
    }
}
