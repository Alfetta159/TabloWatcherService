using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// The channel list, always from the Tablo device's own channels endpoint (GET /guide/channels,
/// then /batch) - never from the guide's airings, which leave out any channel with nothing in
/// the guide. Shared by every channel dropdown, so it's kept for a few minutes rather than
/// re-read from the device each time one opens; a channel scan is rare.
/// </summary>
public interface IDeviceChannels
{
    /// <summary>The device's channels by number, or null if the device couldn't be read.</summary>
    Task<IReadOnlyList<GuideChannel>?> GetAsync(CancellationToken cancellationToken = default);
}

public class DeviceChannels(ICurrentTabloDeviceResolver deviceResolver, ILogger<DeviceChannels> logger) : IDeviceChannels
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    // One read at a time, so a page opening several dropdowns makes one device call, not several.
    private readonly SemaphoreSlim _loading = new(1, 1);
    private IReadOnlyList<GuideChannel>? _channels;
    private DateTimeOffset _loadedAt = DateTimeOffset.MinValue;

    public async Task<IReadOnlyList<GuideChannel>?> GetAsync(CancellationToken cancellationToken = default)
    {
        if (_channels is { } cached && DateTimeOffset.UtcNow - _loadedAt < CacheDuration)
        {
            return cached;
        }

        await _loading.WaitAsync(cancellationToken);
        try
        {
            // Loaded by whoever held the lock first.
            if (_channels is { } fresh && DateTimeOffset.UtcNow - _loadedAt < CacheDuration)
            {
                return fresh;
            }

            var client = await deviceResolver.ResolveAsync();
            if (client is null)
            {
                return _channels;
            }

            var pathsResponse = await client.GetGuideChannelsAsync();
            if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
            {
                logger.LogWarning("Couldn't list the device's channels: {Status}", pathsResponse.StatusCode);
                return _channels;
            }

            var (channels, failedChunks) = await TabloBatch.FetchAsync<GuideChannel>(
                client, pathsResponse.Content, logger, cancellationToken);
            if (failedChunks > 0)
            {
                // A partial list would quietly drop channels from every dropdown for minutes;
                // keep the last complete one (if any) and try again next time.
                return _channels;
            }

            _channels = channels
                .OrderBy(c => c.Channel.Major)
                .ThenBy(c => c.Channel.Minor)
                .ToList();
            _loadedAt = DateTimeOffset.UtcNow;
            return _channels;
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "Couldn't read the device's channels");
            return _channels;
        }
        finally
        {
            _loading.Release();
        }
    }
}
