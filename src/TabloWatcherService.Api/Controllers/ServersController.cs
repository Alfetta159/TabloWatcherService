using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServersController(ITabloDeviceDiscovery deviceDiscovery) : LoggedControllerBase
{
    /// <summary>The Tablo devices that are online right now (see <see cref="ITabloDeviceDiscovery"/>).</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var result = await deviceDiscovery.GetOnlineDevicesAsync(cancellationToken);
        if (result.AssociationServerFailure is { } failure)
        {
            return LogFailure(failure.ToErrorResult());
        }

        return Ok(result.Devices);
    }
}
