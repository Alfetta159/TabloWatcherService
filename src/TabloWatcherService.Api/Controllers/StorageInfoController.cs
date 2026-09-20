using Microsoft.AspNetCore.Mvc;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[ApiController]
[Route("api/storage-info")]
public class StorageInfoController(ITabloDeviceClient tabloDeviceClient) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var response = await tabloDeviceClient.GetStorageInfoAsync();
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
