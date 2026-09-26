using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Response shapes shared by the upcoming TV shows, movies and sports lists, so the
/// frontend's poster grid can treat them alike.
/// </summary>
internal static class UpcomingResponses
{
    public static object Channel(GuideChannel channel) => new
    {
        objectId = channel.ObjectId,
        callSign = channel.Channel.CallSign,
        network = channel.Channel.Network,
        major = channel.Channel.Major,
        minor = channel.Channel.Minor,
    };

    // A channel a title is on, flattened: the channel's fields plus its next airing there.
    public static object Channel(UpcomingChannel channel) => new
    {
        objectId = channel.Channel.ObjectId,
        callSign = channel.Channel.Channel.CallSign,
        network = channel.Channel.Channel.Network,
        major = channel.Channel.Channel.Major,
        minor = channel.Channel.Channel.Minor,
        nextAiring = channel.NextAiring,
        airingCount = channel.AiringCount,
    };

    public static object? Schedule(AiringSchedule? schedule) => schedule is null ? null : new
    {
        state = schedule.State,
        qualifier = schedule.Qualifier,
        skipReason = schedule.SkipReason,
        skipDetail = schedule.SkipDetail,
    };

    // One airing as a detail view lists it: when, where, and whether it'll be recorded.
    public static object Airing(Airing airing) => new
    {
        path = airing.Path,
        datetime = airing.AiringDetails.Datetime,
        duration = airing.AiringDetails.Duration,
        live = airing.Qualifiers.Contains("live"),
        isNew = airing.Qualifiers.Contains("new"),
        channel = Channel(airing.AiringDetails.Channel),
        schedule = Schedule(airing.Schedule),
    };
}
