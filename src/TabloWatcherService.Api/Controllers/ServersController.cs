using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServersController(IAssociationServerClient associationServerClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await associationServerClient.GetRecordersAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content?.Recorders);
    }
}
