using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Whether the guide has listings, for the sidebar: the TV Shows, Movies and Sports pages are
/// hidden while it has none (a Tablo with no listings subscription), and come back when an
/// airings refresh (<see cref="AiringsRefreshService"/>) finds some. Reads the in-memory
/// <see cref="IAiringsStore"/> only - cheap to poll.
/// </summary>
[ApiController]
[Route("api/guide/listings")]
public class GuideListingsController(IAiringsStore store) : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        // Null until the first refresh lands, when hasListings doesn't mean anything yet.
        updatedAt = store.LastUpdated,
        hasListings = store.HasListings,
    });
}
