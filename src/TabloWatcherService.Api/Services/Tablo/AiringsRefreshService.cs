using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Periodically rebuilds the guide grid and search index (<see cref="IAiringsStore"/>) from
/// the first Tablo server the association server knows about: GET /guide/airings for the
/// list of airing paths, then POST /batch in sequential chunks to hydrate them (and then the
/// series, movies and sports they belong to), mirroring the
/// tablo-legacy-m3u Python project's approach to building an EPG from the same API. Unlike
/// that Python client, batches run one at a time - see <see cref="TabloBatch"/>.
/// </summary>
public class AiringsRefreshService(
    ICurrentTabloDeviceResolver deviceResolver,
    IAiringsStore store,
    IConfiguration configuration,
    ILogger<AiringsRefreshService> logger) : BackgroundService
{
    // After a failed refresh (e.g. the association server rate-limiting us at startup),
    // try again soon rather than leaving the guide empty for a whole refresh interval.
    private static readonly TimeSpan FailedRefreshRetryInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(configuration.GetValue("Tablo:AiringsRefreshIntervalMinutes", 15));

        while (!stoppingToken.IsCancellationRequested)
        {
            var succeeded = false;
            try
            {
                succeeded = await RefreshAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Failed to refresh the guide grid");
            }

            var delay = succeeded ? interval : FailedRefreshRetryInterval;
            if (!succeeded)
            {
                logger.LogInformation("Retrying guide grid refresh in {Delay}", delay);
            }

            await Task.Delay(delay, stoppingToken);
        }
    }

    private async Task<bool> RefreshAsync(CancellationToken cancellationToken)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            logger.LogWarning("Couldn't resolve a Tablo device; skipping guide grid refresh");
            return false;
        }

        var pathsResponse = await client.GetGuideAiringsAsync();
        if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
        {
            logger.LogWarning("Couldn't fetch guide airings: {Status}", pathsResponse.StatusCode);
            return false;
        }

        var paths = pathsResponse.Content;
        logger.LogInformation("Found {Count} airing paths", paths.Length);

        var (airings, failedChunks) = await TabloBatch.FetchAsync<Airing>(client, paths, logger, cancellationToken);

        // Cast lists, artwork and series/movie/sport descriptions aren't on the airings
        // themselves, only on the series/movie/sport each one points back to - hydrate those too.
        // A failed chunk here just means fewer of those fields are searchable, not a failed
        // refresh.
        var (series, failedSeriesChunks) = await TabloBatch.FetchAsync<GuideSeries>(
            client, DistinctPaths(airings, a => a.SeriesPath), logger, cancellationToken);
        var (movies, failedMovieChunks) = await TabloBatch.FetchAsync<GuideMovie>(
            client, DistinctPaths(airings, a => a.MoviePath), logger, cancellationToken);
        var (sports, failedSportChunks) = await TabloBatch.FetchAsync<GuideSport>(
            client, DistinctPaths(airings, a => a.SportPath), logger, cancellationToken);

        store.Replace(airings, new GuideDetails(
            ToDictionaryByPath(series, s => s.Path),
            ToDictionaryByPath(movies, m => m.Path),
            ToDictionaryByPath(sports, s => s.Path)));

        logger.LogInformation(
            "Refreshed guide grid: {AiringCount} airings across {ChannelCount} channels, {SeriesCount} series, {MovieCount} movies, {SportCount} sports ({FailedChunks} chunk(s) failed after retries)",
            airings.Count,
            airings.Select(a => a.AiringDetails.Channel.ObjectId).Distinct().Count(),
            series.Count,
            movies.Count,
            sports.Count,
            failedChunks + failedSeriesChunks + failedMovieChunks + failedSportChunks);
        return true;
    }

    private static string[] DistinctPaths(IEnumerable<Airing> airings, Func<Airing, string?> path) =>
        airings.Select(path).OfType<string>().Distinct().ToArray();

    private static Dictionary<string, T> ToDictionaryByPath<T>(IEnumerable<T> items, Func<T, string> path) =>
        items.DistinctBy(path).ToDictionary(path);
}
