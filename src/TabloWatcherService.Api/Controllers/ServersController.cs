using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServersController(IAssociationServerClient associationServerClient) : LoggedControllerBase
{
    private static readonly TimeSpan OnlineThreshold = TimeSpan.FromMinutes(5);

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await associationServerClient.GetRecordersAsync();
        if (!response.IsSuccessful)
        {
            return LogFailure(response.ToErrorResult());
        }

        var activeRecorders = response.Content?.Recorders
            .Where(r => !string.IsNullOrWhiteSpace(r.PrivateIp) && r.IsOnline(OnlineThreshold))
            .OrderBy(r => r.Name)
            .ToArray();

        return Ok(activeRecorders ?? []);
    }
}
