using System.Text.Json.Nodes;
using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Lists the TV shows (series) coming up in the guide, alphabetically, from the same
/// in-memory <see cref="IAiringsStore"/> as the guide grid - no live device call per request.
/// Shows carrying a blocked genre tag (see <see cref="IBlockedTagsStore"/>) are left out
/// entirely, for every caller. One show's detail also reads (and sets) its recording rule
/// live on the device, which the guide cache doesn't keep current.
/// </summary>
[ApiController]
[Route("api/tv-shows")]
public class TvShowsController(
    IAiringsStore store,
    IBlockedTagsStore blockedTags,
    ICurrentTabloDeviceResolver deviceResolver,
    ILogger<TvShowsController> logger) : LoggedControllerBase
{
    // The choices the TV Shows dialog offers, and so all this accepts. Offsets are seconds.
    private static readonly string[] Rules = ["all", "new", "none"];
    private static readonly string[] KeepRules = ["none", "count", "all"];
    private static readonly int[] KeepCounts = [1, 3, 5, 10, 20];
    private static readonly int[] StartOffsets = [0, -120, -300, -600];
    private static readonly int[] EndOffsets = [0, 300, 900, 3600, 7200, 10800];

    [HttpGet]
    public IActionResult Get()
    {
        var blocked = blockedTags.Get();

        return Ok(new
        {
            updatedAt = store.LastUpdated,
            items = store.GetUpcomingSeries(DateTime.UtcNow)
                .Where(s => !(s.Details?.Genres ?? []).Any(blocked.Contains))
                .Select(s => new
                {
                    path = s.Path,
                    title = s.Title,
                    description = s.Details?.Description,
                    genres = s.Details?.Genres ?? [],
                    seriesRating = s.Details?.SeriesRating,
                    // Image ids for GET /api/images/{id}; the thumbnail is the portrait poster.
                    thumbnailImageId = s.Details?.ThumbnailImage?.ImageId,
                    coverImageId = s.Details?.CoverImage?.ImageId,
                    backgroundImageId = s.Details?.BackgroundImage?.ImageId,
                    channels = s.Channels.Select(UpcomingResponses.Channel),
                }),
        });
    }

    /// <summary>
    /// One show's details, its recording rule and options (read live from the device), and
    /// its upcoming episodes by season - for the TV Shows page's detail dialog.
    /// </summary>
    [HttpGet("{seriesId:int}")]
    public async Task<IActionResult> GetById(int seriesId)
    {
        var series = store.GetUpcomingSeries($"/guide/series/{seriesId}", DateTime.UtcNow);
        if (series is null)
        {
            return LogFailure(NotFound());
        }

        // The dialog still shows the show and its episodes if the device can't be reached;
        // only the recording options need it.
        GuideSeries? live = null;
        var client = await deviceResolver.ResolveAsync();
        if (client is not null)
        {
            try
            {
                var response = await client.GetGuideSeriesByIdAsync(seriesId);
                live = response.IsSuccessStatusCode ? response.Content : null;
            }
            catch (HttpRequestException)
            {
            }
        }

        return Ok(Detail(series, live));
    }

    public record SetRecordingRequest(
        string Rule,
        string KeepRule,
        int? KeepCount,
        string? ChannelPath,
        int StartOffset,
        int EndOffset);

    /// <summary>
    /// Sets a show's recording rule (all episodes, new ones or none) and options (how many to
    /// keep, which channel, start early/end late), then re-reads its upcoming episodes, whose
    /// schedules the device changes to match.
    /// </summary>
    /// <returns>The show, as <see cref="GetById"/> returns it.</returns>
    [HttpPut("{seriesId:int}/recording")]
    public async Task<IActionResult> SetRecording(int seriesId, [FromBody] SetRecordingRequest request, CancellationToken cancellationToken)
    {
        var series = store.GetUpcomingSeries($"/guide/series/{seriesId}", DateTime.UtcNow);
        if (series is null)
        {
            return LogFailure(NotFound());
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return LogFailure(StatusCode(StatusCodes.Status503ServiceUnavailable));
        }

        try
        {
            var current = await client.GetGuideSeriesByIdAsync(seriesId);
            if (!current.IsSuccessStatusCode || current.Content is null)
            {
                return LogFailure(current.ToErrorResult());
            }

            // A channel limit must be one the show airs on - or the one already set, which
            // may have since dropped out of the guide.
            var channelPaths = series.Channels.Select(c => c.Channel.Path).Append(current.Content.Schedule.ChannelPath);
            var valid = Rules.Contains(request.Rule)
                && KeepRules.Contains(request.KeepRule)
                && (request.KeepRule != "count" || request.KeepCount is { } count && KeepCounts.Contains(count))
                && (request.ChannelPath is null || channelPaths.Contains(request.ChannelPath))
                && StartOffsets.Contains(request.StartOffset)
                && EndOffsets.Contains(request.EndOffset);
            if (!valid)
            {
                return LogFailure(BadRequest());
            }

            var live = current.Content;
            // The rule and the options go in separate requests - see UpdateGuideSeriesAsync -
            // and each only if it changed.
            if (live.Schedule.Rule != request.Rule)
            {
                var updated = await client.UpdateGuideSeriesAsync(seriesId, new JsonObject { ["schedule"] = request.Rule });
                if (!updated.IsSuccessStatusCode || updated.Content is null)
                {
                    return LogFailure(updated.ToErrorResult());
                }
                live = updated.Content;
            }

            var wanted = new RecordingOptions(
                request.Rule,
                request.KeepRule,
                request.KeepRule == "count" ? request.KeepCount : null,
                request.ChannelPath,
                request.StartOffset,
                request.EndOffset);
            if (Recording(live) with { Rule = request.Rule } != wanted)
            {
                var onTime = request.StartOffset == 0 && request.EndOffset == 0;
                var updated = await client.UpdateGuideSeriesAsync(seriesId, new JsonObject
                {
                    ["schedule"] = new JsonObject
                    {
                        ["channel_path"] = request.ChannelPath,
                        // "none" drops back to the device's default of on time; "show" sets this show's own.
                        ["offsets"] = onTime
                            ? new JsonObject { ["source"] = "none" }
                            : new JsonObject { ["source"] = "show", ["start"] = request.StartOffset, ["end"] = request.EndOffset },
                    },
                    ["keep"] = new JsonObject
                    {
                        ["rule"] = request.KeepRule,
                        ["count"] = request.KeepRule == "count" ? request.KeepCount : null,
                    },
                });
                if (!updated.IsSuccessStatusCode || updated.Content is null)
                {
                    return LogFailure(updated.ToErrorResult());
                }
                live = updated.Content;
            }

            await RefreshSchedulesAsync(client, series.Airings.Select(a => a.Path).ToList(), cancellationToken);
            return Ok(Detail(store.GetUpcomingSeries(series.Path, DateTime.UtcNow) ?? series, live));
        }
        catch (HttpRequestException)
        {
            // The device's embedded server occasionally drops a request outright (see
            // AiringsRefreshService); the caller can simply try again.
            return LogFailure(StatusCode(StatusCodes.Status502BadGateway));
        }
    }

    // A rule change re-schedules every episode on the device; re-read them so the dialog (and
    // the rest of the app) shows that now rather than at the next guide refresh.
    private async Task RefreshSchedulesAsync(ITabloDeviceClient client, IReadOnlyList<string> paths, CancellationToken cancellationToken)
    {
        var (airings, _) = await TabloBatch.FetchAsync<Airing>(client, paths, logger, cancellationToken);
        foreach (var airing in airings)
        {
            if (airing.Schedule is not null)
            {
                store.UpdateSchedule(airing.Path, airing.Schedule);
            }
        }
    }

    private static object Detail(UpcomingTitle<SeriesDetails> series, GuideSeries? live)
    {
        var details = series.Details;
        return new
        {
            path = series.Path,
            title = series.Title,
            description = details?.Description,
            genres = details?.Genres ?? [],
            seriesRating = details?.SeriesRating,
            origAirDate = details?.OrigAirDate,
            episodeRuntime = details?.EpisodeRuntime is > 0 ? details.EpisodeRuntime : (int?)null,
            cast = details?.Cast ?? [],
            thumbnailImageId = details?.ThumbnailImage?.ImageId,
            coverImageId = details?.CoverImage?.ImageId,
            backgroundImageId = details?.BackgroundImage?.ImageId,
            recordingState = AiringSchedule.Summarize(series.Airings),
            channels = series.Channels.Select(c => new
            {
                path = c.Channel.Path,
                callSign = c.Channel.Channel.CallSign,
                major = c.Channel.Channel.Major,
                minor = c.Channel.Channel.Minor,
            }),
            // Null if the device couldn't be reached.
            recording = live is null ? null : Recording(live),
            // By season, lowest first; episodes without a season number last.
            seasons = series.Airings
                .GroupBy(a => a.Episode?.SeasonNumber ?? 0)
                .OrderBy(g => g.Key == 0 ? int.MaxValue : g.Key)
                .Select(g => new
                {
                    number = g.Key == 0 ? (int?)null : g.Key,
                    episodes = g
                        .OrderBy(a => a.Episode?.Number is > 0 ? a.Episode.Number : int.MaxValue)
                        .ThenBy(a => a.AiringDetails.Datetime)
                        .Select(a => new
                        {
                            path = a.Path,
                            datetime = a.AiringDetails.Datetime,
                            duration = a.AiringDetails.Duration,
                            live = a.Qualifiers.Contains("live"),
                            isNew = a.Qualifiers.Contains("new"),
                            channel = UpcomingResponses.Channel(a.AiringDetails.Channel),
                            schedule = UpcomingResponses.Schedule(a.Schedule),
                            episodeNumber = a.Episode?.Number is > 0 ? a.Episode.Number : (int?)null,
                            title = string.IsNullOrWhiteSpace(a.Episode?.Title) ? null : a.Episode.Title,
                            description = string.IsNullOrWhiteSpace(a.Episode?.Description) ? null : a.Episode.Description,
                            origAirDate = a.Episode?.OrigAirDate,
                        }),
                }),
        };
    }

    // A show's recording rule and options as the dialog shows them. Offsets are seconds.
    private record RecordingOptions(
        string Rule,
        string KeepRule,
        int? KeepCount,
        string? ChannelPath,
        int StartOffset,
        int EndOffset);

    private static RecordingOptions Recording(GuideSeries live)
    {
        // "none" offsets mean the device default: on time.
        var offsets = live.Schedule.Offsets.Source == "none" ? null : live.Schedule.Offsets;
        return new RecordingOptions(
            live.Schedule.Rule,
            live.Keep.Rule is { Length: > 0 } keep ? keep : "none",
            live.Keep.Rule == "count" ? live.Keep.Count : null,
            live.Schedule.ChannelPath,
            offsets?.Start ?? 0,
            offsets?.End ?? 0);
    }
}
