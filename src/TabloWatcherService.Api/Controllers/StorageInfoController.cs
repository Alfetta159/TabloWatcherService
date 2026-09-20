using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/storage-info")]
public class StorageInfoController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<StorageInfo>(clientFactory)
{
    protected override Task<ApiResponse<StorageInfo>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetStorageInfoAsync();
}
