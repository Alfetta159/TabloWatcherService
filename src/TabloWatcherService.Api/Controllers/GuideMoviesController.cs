using Microsoft.AspNetCore.Mvc;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

[Route("api/guide-movies")]
public class GuideMoviesController(ITabloDeviceClientFactory clientFactory) : TabloDeviceControllerBase<string[]>(clientFactory)
{
    protected override Task<ApiResponse<string[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetGuideMoviesAsync();

    [HttpGet("{movieId:int}")]
    public async Task<IActionResult> GetById(int movieId, [FromQuery] string ip, [FromQuery] int port = 8885)
    {
        var client = ClientFactory.Create(ip, port);
        var response = await client.GetGuideMovieAsync(movieId);
        if (!response.IsSuccessStatusCode)
        {
            return response.ToErrorResult();
        }

        return Ok(response.Content);
    }
}
