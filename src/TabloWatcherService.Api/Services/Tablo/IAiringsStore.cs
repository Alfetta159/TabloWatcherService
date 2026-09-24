using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// One channel's airings, already filtered to a requested time window.
/// </summary>
public record ChannelAirings(GuideChannel Channel, IReadOnlyList<Airing> Airings);

/// <summary>
/// In-memory store for the guide grid (channels x time). Populated periodically by
/// <see cref="AiringsRefreshService"/>; readers see the previous snapshot until the next
/// full refresh completes - "Replace" swaps a single reference rather than mutating in
/// place, so a reader can never observe a half-updated set of channels.
/// </summary>
public interface IAiringsStore
{
    DateTimeOffset? LastUpdated { get; }

    void Replace(IReadOnlyList<Airing> airings);

    /// <summary>Channels sorted by channel number, each with airings overlapping [from, to).</summary>
    IReadOnlyList<ChannelAirings> GetGrid(DateTime from, DateTime to);
}
