using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Periodically rebuilds the guide grid and search index (<see cref="IAiringsStore"/>) from
/// the first Tablo server the association server knows about: GET /guide/airings for the
/// list of airing paths, then POST /batch in sequential chunks to hydrate them (and then the
/// series and movies they belong to), mirroring the
/// tablo-legacy-m3u Python project's approach to building an EPG from the same API.
///
/// Unlike that Python client, batches here run one at a time rather than a few in parallel:
/// against a real device, concurrent /batch calls caused a meaningful fraction of requests
/// to fail outright ("the response ended prematurely") - its embedded HTTP server appears
/// not to tolerate more than one request in flight. Even sequential, a small fraction of
/// chunks still fail transiently, hence the retry in <see cref="ChunkedBatchAsync"/>.
/// </summary>
public class AiringsRefreshService(
    ICurrentTabloDeviceResolver deviceResolver,
    IAiringsStore store,
    IConfiguration configuration,
    ILogger<AiringsRefreshService> logger) : BackgroundService
{
    private const int BatchSize = 50;
    private const int MaxConcurrentBatches = 1;
    private const int RetryCount = 2;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(500);

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

        var (airings, failedChunks) = await ChunkedBatchAsync<Airing>(client, paths, cancellationToken);

        // Cast lists and series/movie descriptions (for search) aren't on the airings
        // themselves, only on the series/movie each one points back to - hydrate those too.
        // A failed chunk here just means fewer of those fields are searchable, not a failed
        // refresh.
        var (series, failedSeriesChunks) = await ChunkedBatchAsync<GuideSeries>(
            client, DistinctPaths(airings, a => a.SeriesPath), cancellationToken);
        var (movies, failedMovieChunks) = await ChunkedBatchAsync<GuideMovie>(
            client, DistinctPaths(airings, a => a.MoviePath), cancellationToken);

        store.Replace(airings, ToDictionaryByPath(series, s => s.Path), ToDictionaryByPath(movies, m => m.Path));

        logger.LogInformation(
            "Refreshed guide grid: {AiringCount} airings across {ChannelCount} channels, {SeriesCount} series, {MovieCount} movies ({FailedChunks} chunk(s) failed after retries)",
            airings.Count,
            airings.Select(a => a.AiringDetails.Channel.ObjectId).Distinct().Count(),
            series.Count,
            movies.Count,
            failedChunks + failedSeriesChunks + failedMovieChunks);
        return true;
    }

    private static string[] DistinctPaths(IEnumerable<Airing> airings, Func<Airing, string?> path) =>
        airings.Select(path).OfType<string>().Distinct().ToArray();

    private static Dictionary<string, T> ToDictionaryByPath<T>(IEnumerable<T> items, Func<T, string> path) =>
        items.DistinctBy(path).ToDictionary(path);

    private async Task<(List<T> Items, int FailedChunks)> ChunkedBatchAsync<T>(
        ITabloDeviceClient client, IReadOnlyList<string> paths, CancellationToken cancellationToken)
        where T : class
    {
        using var throttle = new SemaphoreSlim(MaxConcurrentBatches);
        var failedChunks = 0;

        var tasks = paths.Chunk(BatchSize).Select(async chunk =>
        {
            await throttle.WaitAsync(cancellationToken);
            try
            {
                for (var attempt = 0; attempt <= RetryCount; attempt++)
                {
                    if (attempt > 0)
                    {
                        await Task.Delay(RetryDelay, cancellationToken);
                    }

                    ApiResponse<IDictionary<string, T>>? response = null;
                    Exception? error = null;
                    try
                    {
                        response = await client.PostBatchAsync<T>(chunk);
                        error = response.Error;
                    }
                    catch (HttpRequestException ex)
                    {
                        // The device's embedded server occasionally drops a request outright
                        // (see class remarks); worth a retry rather than losing the chunk.
                        error = ex;
                    }

                    if (response is { IsSuccessStatusCode: true, Content: not null })
                    {
                        // A path can go stale between the GET and this batch call (e.g. an
                        // airing that's since rolled off the guide); the device returns null
                        // for it rather than omitting the key.
                        return response.Content.Values.Where(a => a is not null).ToList()!;
                    }

                    // Includes a response that arrived but didn't deserialize into T (e.g. a
                    // null where the model expects a value) - which fails the whole chunk, so
                    // it's worth saying why rather than just counting it.
                    if (attempt == RetryCount)
                    {
                        logger.LogWarning(
                            error,
                            "Batch of {Count} {Type} path(s) starting {FirstPath} failed after retries",
                            chunk.Length,
                            typeof(T).Name,
                            chunk[0]);
                    }
                }

                Interlocked.Increment(ref failedChunks);
                return [];
            }
            finally
            {
                throttle.Release();
            }
        });

        var results = await Task.WhenAll(tasks);
        return (results.SelectMany(r => r).ToList(), failedChunks);
    }
}
