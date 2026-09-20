using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Base for controllers that proxy a single no-argument call to a Tablo device's local API.
/// The caller supplies which device to talk to via "ip" (and optionally "port") query
/// parameters, since a device's local address isn't fixed at startup - see
/// <see cref="ITabloDeviceClientFactory"/>.
/// </summary>
[ApiController]
public abstract class TabloDeviceControllerBase<TResponse>(ITabloDeviceClientFactory clientFactory) : ControllerBase
{
    protected ITabloDeviceClientFactory ClientFactory { get; } = clientFactory;

    protected abstract Task<ApiResponse<TResponse>> GetResponseAsync(ITabloDeviceClient client);

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string ip, [FromQuery] int port = 8885)
    {
        var client = ClientFactory.Create(ip, port);
        var response = await GetResponseAsync(client);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
