using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/server-info")]
public class ServerInfoController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<ServerInfo>(clientFactory)
{
    protected override Task<ApiResponse<ServerInfo>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetServerInfoAsync();
}
