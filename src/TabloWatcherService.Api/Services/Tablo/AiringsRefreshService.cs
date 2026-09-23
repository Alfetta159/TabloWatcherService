using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Periodically rebuilds the guide grid (<see cref="IAiringsStore"/>) from the first Tablo
/// server the association server knows about: GET /guide/airings for the list of airing
/// paths, then POST /batch in sequential chunks to hydrate them, mirroring the
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

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(configuration.GetValue("Tablo:AiringsRefreshIntervalMinutes", 15));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to refresh the guide grid");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task RefreshAsync(CancellationToken cancellationToken)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            logger.LogWarning("No Tablo servers registered; skipping guide grid refresh");
            return;
        }

        var pathsResponse = await client.GetGuideAiringsAsync();
        if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
        {
            logger.LogWarning("Couldn't fetch guide airings: {Status}", pathsResponse.StatusCode);
            return;
        }

        var paths = pathsResponse.Content;
        logger.LogInformation("Found {Count} airing paths", paths.Length);

        var (airings, failedChunks) = await ChunkedBatchAsync(client, paths, cancellationToken);
        store.Replace(airings);

        logger.LogInformation(
            "Refreshed guide grid: {AiringCount} airings across {ChannelCount} channels ({FailedChunks} chunk(s) failed after retries)",
            airings.Count,
            airings.Select(a => a.AiringDetails.Channel.ObjectId).Distinct().Count(),
            failedChunks);
    }

    private static async Task<(List<Airing> Airings, int FailedChunks)> ChunkedBatchAsync(
        ITabloDeviceClient client, IReadOnlyList<string> paths, CancellationToken cancellationToken)
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

                    ApiResponse<IDictionary<string, Airing>>? response = null;
                    try
                    {
                        response = await client.PostBatchAsync<Airing>(chunk);
                    }
                    catch (HttpRequestException)
                    {
                        // The device's embedded server occasionally drops a request outright
                        // (see class remarks); worth a retry rather than losing the chunk.
                    }

                    if (response is { IsSuccessStatusCode: true, Content: not null })
                    {
                        // A path can go stale between the GET and this batch call (e.g. an
                        // airing that's since rolled off the guide); the device returns null
                        // for it rather than omitting the key.
                        return response.Content.Values.Where(a => a is not null).ToList()!;
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
