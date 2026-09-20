using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/server-capabilities")]
public class ServerCapabilitiesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<ServerCapabilities>(clientFactory)
{
    protected override Task<ApiResponse<ServerCapabilities>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetServerCapabilitiesAsync();
}
