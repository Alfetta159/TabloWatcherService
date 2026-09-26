using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Proxies image assets from the Tablo device - the browser can't reach the device
/// directly (it rejects requests without the User-Agent this app sets, and its address
/// isn't known to the frontend anyway; see <see cref="ICurrentTabloDeviceResolver"/>).
/// </summary>
[ApiController]
[Route("api/images")]
public class ImagesController(ICurrentTabloDeviceResolver deviceResolver) : ControllerBase
{
    [HttpGet("{imageId:int}")]
    public async Task<IActionResult> Get(int imageId)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return NotFound();
        }

        try
        {
            using var response = await client.GetImageAsync(imageId);
            if (!response.IsSuccessStatusCode)
            {
                return StatusCode((int)response.StatusCode);
            }

            var bytes = await response.Content.ReadAsByteArrayAsync();
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "image/jpeg";

            // An image id always names the same image, so let the browser keep it rather than
            // re-fetching through the device (e.g. every poster on the TV Shows page, each visit).
            Response.Headers.CacheControl = "private, max-age=604800, immutable";

            return File(bytes, contentType);
        }
        catch (HttpRequestException)
        {
            // GetImageAsync returns a raw HttpResponseMessage (not ApiResponse<T>, which
            // catches this internally - see RefitResponseExtensions), so the device's known
            // occasional dropped connection surfaces as a real exception here. Nothing to
            // retry against for a single image load, so just report it rather than 500.
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    // A movie/series airing only carries a path back to its movie or series (see
    // Airing.MoviePath/SeriesPath) - the image ids live on that separate object, so
    // resolving "the backdrop/thumbnail for this airing" takes an extra device call before
    // we even know which image to fetch.
    [HttpGet("background")]
    public Task<IActionResult> GetBackground([FromQuery] string? moviePath, [FromQuery] string? seriesPath) =>
        RedirectToArtworkAsync(moviePath, seriesPath, m => m.BackgroundImage, s => s.BackgroundImage);

    [HttpGet("thumbnail")]
    public Task<IActionResult> GetThumbnail([FromQuery] string? moviePath, [FromQuery] string? seriesPath) =>
        RedirectToArtworkAsync(moviePath, seriesPath, m => m.ThumbnailImage, s => s.ThumbnailImage);

    private async Task<IActionResult> RedirectToArtworkAsync(
        string? moviePath,
        string? seriesPath,
        Func<MovieDetails, MovieImage?> movieImage,
        Func<SeriesDetails, MovieImage?> seriesImage)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return NotFound();
        }

        int? imageId = null;

        if (TryExtractId(moviePath, out var movieId))
        {
            var movie = await client.GetGuideMovieAsync(movieId);
            imageId = movie is { IsSuccessStatusCode: true, Content: not null } ? movieImage(movie.Content.Movie)?.ImageId : null;
        }
        else if (TryExtractId(seriesPath, out var seriesId))
        {
            var series = await client.GetGuideSeriesByIdAsync(seriesId);
            imageId = series is { IsSuccessStatusCode: true, Content: not null } ? seriesImage(series.Content.Series)?.ImageId : null;
        }

        if (imageId is null)
        {
            return NotFound();
        }

        return RedirectToAction(nameof(Get), new { imageId });
    }

    private static bool TryExtractId(string? path, out int id)
    {
        id = 0;
        var segment = path?.Split('/').LastOrDefault();
        return segment is not null && int.TryParse(segment, out id);
    }
}
