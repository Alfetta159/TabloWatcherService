using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The Settings page's Channels tab: every channel the current Tablo device has (read live,
/// so channels with nothing in the guide still show), each with what the guide cache
/// (<see cref="IAiringsStore"/>) and recordings cache (<see cref="IRecordingsStore"/>) know
/// about it - what's on now and next, how far ahead the guide runs, and how much has been
/// or will be recorded from it.
/// </summary>
[ApiController]
[Route("api/channels")]
public class ChannelsController(
    ICurrentTabloDeviceResolver deviceResolver,
    IAiringsStore store,
    IRecordingsStore recordings,
    ILogger<ChannelsController> logger) : ControllerBase
{
    // How many airings after the current one each channel lists.
    private const int UpNextCount = 3;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        List<GuideChannel> channels;
        try
        {
            var pathsResponse = await client.GetGuideChannelsAsync();
            if (!pathsResponse.IsSuccessStatusCode)
            {
                return pathsResponse.ToErrorResult();
            }

            var (fetched, failedChunks) = await TabloBatch.FetchAsync<GuideChannel>(
                client, pathsResponse.Content ?? [], logger, cancellationToken);
            if (failedChunks > 0 && fetched.Count == 0)
            {
                return StatusCode(StatusCodes.Status502BadGateway);
            }
            channels = fetched;
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }

        var now = DateTime.UtcNow;
        var upcomingByChannel = store.GetGrid(now, DateTime.MaxValue)
            .ToDictionary(c => c.Channel.ObjectId, c => c.Airings);
        var scheduledByChannel = store.GetScheduledAirings(now)
            .GroupBy(s => s.Airing.AiringDetails.Channel.ObjectId)
            .ToDictionary(g => g.Key, g => g.Count());
        // A recording's channel is its own /recordings/channels/... copy with a different
        // object id, so recordings are matched to guide channels by RecordingChannelKey.
        var recordedByChannel = recordings.Recordings.Values
            .GroupBy(r => RecordingChannelKey(r.AiringDetails.Channel.Channel))
            .ToDictionary(g => g.Key, g => g.ToList());

        return Ok(new
        {
            guideUpdatedAt = store.LastUpdated,
            recordingsUpdatedAt = recordings.LastUpdated,
            channels = channels
                .OrderBy(c => c.Channel.Major)
                .ThenBy(c => c.Channel.Minor)
                .Select(c =>
                {
                    var upcoming = upcomingByChannel.GetValueOrDefault(c.ObjectId) ?? [];
                    var onNow = upcoming.FirstOrDefault(a => a.AiringDetails.Datetime <= now);
                    var recorded = recordedByChannel.GetValueOrDefault(RecordingChannelKey(c.Channel)) ?? [];
                    var last = upcoming.Count > 0 ? upcoming[^1].AiringDetails : null;

                    return new
                    {
                        objectId = c.ObjectId,
                        path = c.Path,
                        callSign = c.Channel.CallSign,
                        name = c.Channel.Name,
                        major = c.Channel.Major,
                        minor = c.Channel.Minor,
                        network = c.Channel.Network,
                        resolution = c.Channel.Resolution,
                        flags = c.Channel.Flags,
                        favourite = c.Channel.Favourite,
                        source = c.Channel.Source,
                        callSignSource = c.Channel.CallSignSrc,
                        tmsStationId = c.Channel.TmsStationId,
                        tmsAffiliateId = c.Channel.TmsAffiliateId,
                        channelIdentifier = c.Channel.ChannelIdentifier,
                        logos = c.Channel.Logos.Select(l => new { kind = l.Kind, url = l.Url }),
                        onNow = onNow is null ? null : Program(onNow),
                        upNext = upcoming.Where(a => a != onNow).Take(UpNextCount).Select(Program),
                        upcomingAiringCount = upcoming.Count,
                        // When the last airing in the guide for this channel ends.
                        guideThrough = last?.Datetime.AddSeconds(last.Duration),
                        scheduledCount = scheduledByChannel.GetValueOrDefault(c.ObjectId),
                        recordingCount = recorded.Count,
                        recordingsSize = recorded.Sum(r => r.VideoDetails?.Size ?? 0),
                        lastRecordedAt = recorded.Count > 0 ? recorded.Max(r => r.AiringDetails.Datetime) : (DateTime?)null,
                    };
                }),
        });
    }

    // The station's TMS channel identifier (e.g. "S20451_003_01"), or its number without one.
    private static string RecordingChannelKey(ChannelDetails channel) =>
        channel.ChannelIdentifier is { Length: > 0 } id ? id : $"{channel.Major}.{channel.Minor}";

    private static object Program(Airing airing) => new
    {
        path = airing.Path,
        title = airing.AiringDetails.ShowTitle,
        episodeTitle = airing.Episode?.Title is { Length: > 0 } t ? t : airing.Event?.Title,
        datetime = airing.AiringDetails.Datetime,
        duration = airing.AiringDetails.Duration,
        schedule = UpcomingResponses.Schedule(airing.Schedule),
    };
}
