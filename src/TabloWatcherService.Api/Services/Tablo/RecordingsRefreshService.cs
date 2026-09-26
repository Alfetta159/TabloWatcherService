using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Keeps <see cref="IRecordingsStore"/> in step with the recordings on "the" Tablo device:
/// GET /recordings/airings for every recording's path, then /batch (see
/// <see cref="TabloBatch"/>) to hydrate them and the series/movies/sports/programs they
/// belong to.
///
/// A device can hold thousands of recordings (one real one: ~4,500 - about 90 batches), so
/// after the first full load each refresh only fetches new recordings and ones not yet
/// finished (still recording, so their size/duration are changing); the rest are reused
/// from the last snapshot. A full re-read every <see cref="FullRefreshInterval"/> picks up
/// what that misses, like watched state and playback position changed by other Tablo apps.
/// </summary>
public class RecordingsRefreshService(
    ICurrentTabloDeviceResolver deviceResolver,
    IRecordingsStore store,
    IConfiguration configuration,
    ILogger<RecordingsRefreshService> logger) : BackgroundService
{
    private static readonly TimeSpan FullRefreshInterval = TimeSpan.FromHours(1);
    private static readonly TimeSpan FailedRefreshRetryInterval = TimeSpan.FromMinutes(1);

    private DateTimeOffset _lastFullRefresh = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(configuration.GetValue("Tablo:RecordingsRefreshIntervalMinutes", 15));

        while (!stoppingToken.IsCancellationRequested)
        {
            var succeeded = false;
            try
            {
                succeeded = await RefreshAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Failed to refresh recordings");
            }

            await Task.Delay(succeeded ? interval : FailedRefreshRetryInterval, stoppingToken);
        }
    }

    private async Task<bool> RefreshAsync(CancellationToken cancellationToken)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            logger.LogWarning("Couldn't resolve a Tablo device; skipping recordings refresh");
            return false;
        }

        var pathsResponse = await client.GetRecordedAiringsAsync();
        if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
        {
            logger.LogWarning("Couldn't list recordings: {Status}", pathsResponse.StatusCode);
            return false;
        }

        var paths = pathsResponse.Content;
        var full = DateTimeOffset.UtcNow - _lastFullRefresh >= FullRefreshInterval;
        var cached = full ? new Dictionary<string, RecordedAiring>() : store.Recordings;

        var toFetch = paths
            .Where(path => !cached.TryGetValue(path, out var recording) || recording.VideoDetails?.State != "finished")
            .ToList();
        var (fetched, failedChunks) = await TabloBatch.FetchAsync<RecordedAiring>(client, toFetch, logger, cancellationToken);

        // Listed paths only, so a deleted recording drops out; one whose chunk failed keeps
        // its last-known state, if any.
        var fetchedByPath = fetched.DistinctBy(r => r.Path).ToDictionary(r => r.Path);
        var recordings = paths
            .Select(path => fetchedByPath.GetValueOrDefault(path) ?? cached.GetValueOrDefault(path))
            .OfType<RecordedAiring>()
            .ToList();

        var parents = await RefreshParentsAsync(client, recordings, full ? RecordingParents.Empty : store.Parents, cancellationToken);
        store.Replace(recordings, parents);

        if (full && failedChunks == 0)
        {
            _lastFullRefresh = DateTimeOffset.UtcNow;
        }

        logger.LogInformation(
            "Refreshed recordings ({Mode}): {Count} recordings, {Fetched} fetched ({FailedChunks} chunk(s) failed after retries)",
            full ? "full" : "incremental",
            recordings.Count,
            fetched.Count,
            failedChunks);
        return true;
    }

    // Fetches the parents not already known; parents rarely change, and a full refresh
    // passes no known ones, so it re-reads them all.
    private async Task<RecordingParents> RefreshParentsAsync(
        ITabloDeviceClient client, IReadOnlyList<RecordedAiring> recordings, RecordingParents known, CancellationToken cancellationToken)
    {
        return new RecordingParents(
            await FetchMissingAsync(client, recordings.Select(r => r.SeriesPath), known.Series, s => s.Path, cancellationToken),
            await FetchMissingAsync(client, recordings.Select(r => r.MoviePath), known.Movies, m => m.Path, cancellationToken),
            await FetchMissingAsync(client, recordings.Select(r => r.SportPath), known.Sports, s => s.Path, cancellationToken),
            await FetchMissingAsync(client, recordings.Select(r => r.ProgramPath), known.Programs, p => p.Path, cancellationToken));
    }

    private async Task<Dictionary<string, T>> FetchMissingAsync<T>(
        ITabloDeviceClient client,
        IEnumerable<string?> paths,
        IReadOnlyDictionary<string, T> known,
        Func<T, string> pathOf,
        CancellationToken cancellationToken)
        where T : class
    {
        var needed = paths.OfType<string>().Distinct().ToList();
        var (fetched, _) = await TabloBatch.FetchAsync<T>(
            client, needed.Where(path => !known.ContainsKey(path)).ToList(), logger, cancellationToken);

        var result = needed
            .Select(path => known.GetValueOrDefault(path))
            .OfType<T>()
            .Concat(fetched)
            .DistinctBy(pathOf)
            .ToDictionary(pathOf);
        return result;
    }
}
