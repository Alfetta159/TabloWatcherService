namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Runs a refresh loop for every online Tablo, each on its own schedule: a device that's
/// slow or failing doesn't hold up the others, and one that comes online later gets a loop
/// of its own when it's first seen. A loop skips its device while it's offline.
/// </summary>
public abstract class PerDeviceRefreshService(ITabloDeviceRegistry registry, ILogger logger) : BackgroundService
{
    // How often to look for devices that came online since.
    private static readonly TimeSpan DeviceCheckInterval = TimeSpan.FromSeconds(30);

    // After a failed refresh (or while the device is offline), try again soon rather than
    // leaving its data stale for a whole refresh interval.
    protected static readonly TimeSpan FailedRefreshRetryInterval = TimeSpan.FromMinutes(1);

    /// <summary>What's refreshed, for log messages - e.g. "guide grid".</summary>
    protected abstract string What { get; }

    protected abstract TimeSpan Interval { get; }

    /// <returns>Whether the refresh succeeded; a failed one is retried sooner.</returns>
    protected abstract Task<bool> RefreshAsync(TabloDevice device, ITabloDeviceClient client, CancellationToken cancellationToken);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var loops = new Dictionary<string, Task>();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                foreach (var device in await registry.GetOnlineAsync(stoppingToken))
                {
                    if (!loops.ContainsKey(device.ServerId))
                    {
                        loops[device.ServerId] = RunLoopAsync(device, stoppingToken);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Couldn't list Tablo devices for the {What} refresh", What);
            }

            await Task.Delay(DeviceCheckInterval, stoppingToken);
        }
    }

    private async Task RunLoopAsync(TabloDevice device, CancellationToken stoppingToken)
    {
        // Off the caller's synchronous path, so starting a loop doesn't wait on its first refresh.
        await Task.Yield();

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var succeeded = false;
                try
                {
                    var online = await registry.GetOnlineAsync(stoppingToken);
                    var client = online.Any(d => d.ServerId == device.ServerId) ? device.CreateClient() : null;
                    if (client is null)
                    {
                        logger.LogDebug("Skipping {What} refresh for {Device}: it's offline", What, device.Name);
                    }
                    else
                    {
                        succeeded = await RefreshAsync(device, client, stoppingToken);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Failed to refresh the {What} for {Device}", What, device.Name);
                }

                await Task.Delay(succeeded ? Interval : FailedRefreshRetryInterval, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }
}
