using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Talks to a Tablo device's own local HTTP API (host:port from
/// <see cref="IAssociationServerClient"/>'s recorder list), as opposed to Tablo's
/// public cloud API.
/// </summary>
public interface ITabloDeviceClient
{
    [Get("/account/subscription")]
    Task<ApiResponse<SubscriptionInfo>> GetSubscriptionAsync();

    [Get("/server/info")]
    Task<ApiResponse<ServerInfo>> GetServerInfoAsync();

    [Get("/server/capabilities")]
    Task<ApiResponse<ServerCapabilities>> GetServerCapabilitiesAsync();

    [Get("/server/guide/status")]
    Task<ApiResponse<GuideStatus>> GetGuideStatusAsync();

    [Get("/server/update/info")]
    Task<ApiResponse<UpdateInfo>> GetUpdateInfoAsync();

    [Get("/server/harddrives")]
    Task<ApiResponse<HardDrive[]>> GetHardDrivesAsync();

    [Get("/storage/info")]
    Task<ApiResponse<StorageInfo>> GetStorageInfoAsync();

    [Get("/server/tuners")]
    Task<ApiResponse<Tuner[]>> GetTunersAsync();

    [Get("/guide/channels")]
    Task<ApiResponse<string[]>> GetGuideChannelsAsync();

    [Post("/batch")]
    Task<ApiResponse<IDictionary<string, T>>> PostBatchAsync<T>([Body] IEnumerable<string> paths) where T : class;

    [Get("/guide/channels/{channelId}")]
    Task<ApiResponse<GuideChannel>> GetGuideChannelAsync(int channelId);

    [Get("/guide/program")]
    Task<ApiResponse<string[]>> GetGuideProgramsAsync();

    [Get("/guide/movies")]
    Task<ApiResponse<string[]>> GetGuideMoviesAsync();

    [Get("/guide/movies/{movieId}")]
    Task<ApiResponse<GuideMovie>> GetGuideMovieAsync(int movieId);

    [Get("/recordings/airings")]
    Task<ApiResponse<string[]>> GetRecordedAiringsAsync();

    [Get("/guide/airings")]
    Task<ApiResponse<string[]>> GetGuideAiringsAsync();

    [Get("/guide/series")]
    Task<ApiResponse<string[]>> GetGuideSeriesAsync();

    [Get("/guide/series/{seriesId}")]
    Task<ApiResponse<GuideSeries>> GetGuideSeriesByIdAsync(int seriesId);

    [Get("/guide/series/seasons/{seasonId}")]
    Task<ApiResponse<SeriesSeason>> GetSeriesSeasonAsync(int seasonId);

    [Get("/guide/shows")]
    Task<ApiResponse<string[]>> GetGuideShowsAsync();

    // Raw HttpResponseMessage, not ApiResponse<T>: this returns an image (e.g. image/jpeg),
    // not JSON, so it bypasses the configured JSON content serializer entirely.
    [Get("/images/{imageId}")]
    Task<HttpResponseMessage> GetImageAsync(int imageId);

    // Schedules (true) or cancels (false) a recording of one airing - a series episode, movie
    // airing or sports event - by PATCHing the airing's own path (e.g.
    // "guide/movies/airings/123", no leading slash: "**" keeps its slashes unescaped). The
    // device answers with the whole airing, its "schedule" updated.
    [Patch("/{**airingPath}")]
    Task<ApiResponse<Airing>> SetAiringScheduledAsync(string airingPath, [Body] ScheduleRequest request);

    // Starts (or renews) a live stream for this channel and allocates a tuner; the
    // playlist_url it returns points directly at the device's separate streaming server
    // (a different port than this JSON API) and is CORS-open, so the frontend plays it
    // directly rather than through this backend.
    [Post("/guide/channels/{channelId}/watch")]
    Task<ApiResponse<WatchInfo>> WatchChannelAsync(int channelId);
}

// Body for ITabloDeviceClient.SetAiringScheduledAsync - serialized as {"scheduled": true}.
public record ScheduleRequest(bool Scheduled);
