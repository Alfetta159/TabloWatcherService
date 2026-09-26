namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Hydrates many Tablo object paths through the device's POST /batch, a chunk at a time, for
/// the background caches (<see cref="AiringsRefreshService"/>, <see cref="RecordingsRefreshService"/>).
///
/// Chunks run strictly one at a time, and across every caller: against a real device,
/// concurrent /batch calls made a meaningful fraction fail outright ("the response ended
/// prematurely") - its embedded HTTP server appears not to tolerate more than one request in
/// flight. So one process-wide gate serializes chunks from all services; a guide refresh
/// and a recordings refresh interleave chunk by chunk instead of colliding. Even
/// sequential, a small fraction of chunks still fail transiently, hence the retry.
/// </summary>
public static class TabloBatch
{
    private const int BatchSize = 50;
    private const int RetryCount = 2;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(500);

    private static readonly SemaphoreSlim DeviceGate = new(1, 1);

    public static async Task<(List<T> Items, int FailedChunks)> FetchAsync<T>(
        ITabloDeviceClient client, IReadOnlyList<string> paths, ILogger logger, CancellationToken cancellationToken)
        where T : class
    {
        var items = new List<T>();
        var failedChunks = 0;

        foreach (var chunk in paths.Chunk(BatchSize))
        {
            var fetched = await FetchChunkAsync<T>(client, chunk, logger, cancellationToken);
            if (fetched is null)
            {
                failedChunks++;
            }
            else
            {
                items.AddRange(fetched);
            }
        }

        return (items, failedChunks);
    }

    // The chunk's objects, or null if it failed even after retries.
    private static async Task<List<T>?> FetchChunkAsync<T>(
        ITabloDeviceClient client, string[] chunk, ILogger logger, CancellationToken cancellationToken)
        where T : class
    {
        for (var attempt = 0; attempt <= RetryCount; attempt++)
        {
            if (attempt > 0)
            {
                await Task.Delay(RetryDelay, cancellationToken);
            }

            ApiResponse<IDictionary<string, T>>? response = null;
            Exception? error = null;
            await DeviceGate.WaitAsync(cancellationToken);
            try
            {
                response = await client.PostBatchAsync<T>(chunk);
                error = response.Error;
            }
            catch (HttpRequestException ex)
            {
                // The device's embedded server occasionally drops a request outright; worth
                // a retry rather than losing the chunk.
                error = ex;
            }
            finally
            {
                DeviceGate.Release();
            }

            if (response is { IsSuccessStatusCode: true, Content: not null })
            {
                // A path can go stale between listing it and this batch call (e.g. an airing
                // that's since rolled off the guide); the device returns null for it rather
                // than omitting the key.
                return response.Content.Values.Where(item => item is not null).ToList()!;
            }

            // Includes a response that arrived but didn't deserialize into T (e.g. a null
            // where the model expects a value) - which fails the whole chunk, so it's worth
            // saying why rather than just counting it.
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

        return null;
    }
}
