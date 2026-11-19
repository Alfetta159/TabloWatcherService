using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Periodically rebuilds each online Tablo's guide grid and search index (its
/// <see cref="TabloDevice.Airings"/>): GET /guide/airings for the
/// list of airing paths, then POST /batch in sequential chunks to hydrate them (and then the
/// series, movies and sports they belong to), mirroring the
/// tablo-legacy-m3u Python project's approach to building an EPG from the same API. Unlike
/// that Python client, batches run one at a time - see <see cref="TabloBatch"/>.
/// </summary>
public class AiringsRefreshService(
    ITabloDeviceRegistry registry,
    IConfiguration configuration,
    ILogger<AiringsRefreshService> logger) : PerDeviceRefreshService(registry, logger)
{
    protected override string What => "guide grid";

    protected override TimeSpan Interval =>
        TimeSpan.FromMinutes(configuration.GetValue("Tablo:AiringsRefreshIntervalMinutes", 15));

    protected override async Task<bool> RefreshAsync(TabloDevice device, ITabloDeviceClient client, CancellationToken cancellationToken)
    {
        var pathsResponse = await client.GetGuideAiringsAsync();
        if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
        {
            logger.LogWarning("Couldn't fetch guide airings from {Device}: {Status}", device.Name, pathsResponse.StatusCode);
            return false;
        }

        var paths = pathsResponse.Content;
        logger.LogInformation("Found {Count} airing paths on {Device}", paths.Length, device.Name);

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

        device.Airings.Replace(airings, new GuideDetails(
            ToDictionaryByPath(series, s => s.Path),
            ToDictionaryByPath(movies, m => m.Path),
            ToDictionaryByPath(sports, s => s.Path)));

        logger.LogInformation(
            "Refreshed guide grid for {Device}: {AiringCount} airings across {ChannelCount} channels, {SeriesCount} series, {MovieCount} movies, {SportCount} sports ({FailedChunks} chunk(s) failed after retries)",
            device.Name,
            airings.Count,
            airings.Select(a => a.AiringDetails.Channel.ObjectId).Distinct().Count(),
            series.Count,
            movies.Count,
            sports.Count,
            failedChunks + failedSeriesChunks + failedMovieChunks + failedSportChunks);

        // New listings may match a keyword recording. Its own failures are retried at the next
        // refresh; they don't make this one a failure.
        try
        {
            await device.KeywordRecordings.ApplyAsync(cancellationToken: cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Failed to apply keyword recordings on {Device}", device.Name);
        }

        return true;
    }

    private static string[] DistinctPaths(IEnumerable<Airing> airings, Func<Airing, string?> path) =>
        airings.Select(path).OfType<string>().Distinct().ToArray();

    private static Dictionary<string, T> ToDictionaryByPath<T>(IEnumerable<T> items, Func<T, string> path) =>
        items.DistinctBy(path).ToDictionary(path);
}
