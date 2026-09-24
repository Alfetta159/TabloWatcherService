using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

public class AiringsStore : IAiringsStore
{
    // Assigned wholesale by Replace(), never mutated in place, so a concurrent reader
    // always sees one complete, internally-consistent snapshot with no locking needed.
    private volatile IReadOnlyList<ChannelAirings> _channels = [];

    public DateTimeOffset? LastUpdated { get; private set; }

    public void Replace(IReadOnlyList<Airing> airings)
    {
        _channels = airings
            .GroupBy(a => a.AiringDetails.Channel.ObjectId)
            .Select(group => new ChannelAirings(
                group.First().AiringDetails.Channel,
                group.OrderBy(a => a.AiringDetails.Datetime).ToList()))
            .OrderBy(c => c.Channel.Channel.Major)
            .ThenBy(c => c.Channel.Channel.Minor)
            .ToList();

        LastUpdated = DateTimeOffset.UtcNow;
    }

    public IReadOnlyList<ChannelAirings> GetGrid(DateTime from, DateTime to) =>
        _channels
            .Select(c => c with
            {
                Airings = c.Airings
                    .Where(a => a.AiringDetails.Datetime < to
                        && a.AiringDetails.Datetime.AddSeconds(a.AiringDetails.Duration) > from)
                    .ToList(),
            })
            .ToList();
}
