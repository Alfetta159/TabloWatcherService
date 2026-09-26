using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Schedules and cancels recordings of individual airings on "the" Tablo device (see
/// <see cref="ICurrentTabloDeviceResolver"/>), keeping the in-memory guide in step so the
/// change shows immediately rather than at the next refresh.
/// </summary>
[ApiController]
[Route("api/airings")]
public class AiringsController(ICurrentTabloDeviceResolver deviceResolver, IAiringsStore store) : ControllerBase
{
    // The airing kinds a recording can be set on - each PATCHed at its own path.
    private static readonly string[] SchedulablePathPrefixes =
    [
        "/guide/series/episodes/", "/guide/movies/airings/", "/guide/sports/events/", "/guide/programs/airings/",
    ];

    public record SetScheduleRequest(string Path, bool Scheduled);

    /// <summary>Schedules (<c>scheduled: true</c>) or cancels a recording of one airing.</summary>
    /// <returns>The airing, with its new schedule.</returns>
    [HttpPut("schedule")]
    public async Task<IActionResult> SetSchedule([FromBody] SetScheduleRequest request)
    {
        // Only ever PATCH an airing the guide actually has - never an arbitrary device path.
        var airing = store.GetAiring(request.Path);
        if (airing is null || !SchedulablePathPrefixes.Any(request.Path.StartsWith))
        {
            return NotFound();
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        ApiResponse<Models.Airing> response;
        try
        {
            response = await client.SetAiringScheduledAsync(request.Path.TrimStart('/'), new ScheduleRequest(request.Scheduled));
        }
        catch (HttpRequestException)
        {
            // The device's embedded server occasionally drops a request outright (see
            // AiringsRefreshService); the caller can simply try again.
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        if (!response.IsSuccessStatusCode || response.Content?.Schedule is null)
        {
            return response.IsSuccessStatusCode ? StatusCode(StatusCodes.Status502BadGateway) : response.ToErrorResult();
        }

        store.UpdateSchedule(request.Path, response.Content.Schedule);

        // Scheduling one airing of a movie can change its others (the device skips later
        // airings as duplicates, or un-skips them on cancel), so re-read those too. Other
        // knock-on effects - e.g. an unrelated recording now in conflict for a tuner - show up
        // at the next full guide refresh.
        if (airing.MoviePath is not null)
        {
            await RefreshSchedulesAsync(client, store.GetMovieAirings(airing.MoviePath)
                .Select(a => a.Path)
                .Where(path => path != request.Path)
                .ToList());
        }

        return Ok(UpcomingResponses.Airing(store.GetAiring(request.Path) ?? response.Content));
    }

    private async Task RefreshSchedulesAsync(ITabloDeviceClient client, IReadOnlyList<string> paths)
    {
        if (paths.Count == 0)
        {
            return;
        }

        try
        {
            var batch = await client.PostBatchAsync<Models.Airing>(paths);
            if (batch is { IsSuccessStatusCode: true, Content: not null })
            {
                foreach (var (path, refreshed) in batch.Content)
                {
                    if (refreshed?.Schedule is not null)
                    {
                        store.UpdateSchedule(path, refreshed.Schedule);
                    }
                }
            }
        }
        catch (HttpRequestException)
        {
            // Best-effort: the recording itself was already set; the others catch up at the
            // next refresh.
        }
    }
}
