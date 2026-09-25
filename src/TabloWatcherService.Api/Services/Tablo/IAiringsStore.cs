using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// One channel's airings, already filtered to a requested time window.
/// </summary>
public record ChannelAirings(GuideChannel Channel, IReadOnlyList<Airing> Airings);

/// <summary>
/// One airing that matched a search, with which of its fields matched (see
/// <see cref="SearchFields"/>) and, for a cast match, the matching cast members' names.
/// </summary>
public record AiringSearchResult(Airing Airing, IReadOnlyList<string> MatchedFields, IReadOnlyList<string> MatchedCast);

/// <summary>
/// A series with at least one airing that hasn't ended yet. <see cref="Series"/> is null if
/// the series object couldn't be fetched from the device (the airings still identify it).
/// </summary>
public record UpcomingSeries(
    string Path,
    string Title,
    SeriesDetails? Series,
    IReadOnlyList<UpcomingSeriesChannel> Channels);

/// <summary>One channel a series is coming up on: its soonest airing there and how many there are.</summary>
public record UpcomingSeriesChannel(GuideChannel Channel, DateTime NextAiring, int AiringCount);

/// <summary>The field names reported in <see cref="AiringSearchResult.MatchedFields"/>.</summary>
public static class SearchFields
{
    public const string Title = "title";
    public const string EpisodeTitle = "episodeTitle";
    public const string Description = "description";
    public const string Cast = "cast";
}

/// <summary>
/// In-memory store for the guide grid (channels x time), guide search and the upcoming
/// series list. Populated
/// periodically by <see cref="AiringsRefreshService"/>; readers see the previous snapshot
/// until the next full refresh completes - "Replace" swaps a single reference rather than
/// mutating in place, so a reader can never observe a half-updated set of channels.
/// </summary>
public interface IAiringsStore
{
    DateTimeOffset? LastUpdated { get; }

    /// <param name="airings">Every airing in the guide.</param>
    /// <param name="series">Series the airings belong to, keyed by path (<see cref="Airing.SeriesPath"/>) - the source of series descriptions and cast.</param>
    /// <param name="movies">Likewise for movies, keyed by <see cref="Airing.MoviePath"/>.</param>
    void Replace(
        IReadOnlyList<Airing> airings,
        IReadOnlyDictionary<string, GuideSeries> series,
        IReadOnlyDictionary<string, GuideMovie> movies);

    /// <summary>Channels sorted by channel number, each with airings overlapping [from, to).</summary>
    IReadOnlyList<ChannelAirings> GetGrid(DateTime from, DateTime to);

    /// <summary>
    /// Airings that haven't ended by <paramref name="now"/> whose show/episode title,
    /// description or cast contains <paramref name="term"/> at the start of a word, soonest
    /// first. Matching ignores case, accents and runs of whitespace, so "tom  hanks" finds
    /// "Tom Hanks".
    /// </summary>
    IReadOnlyList<AiringSearchResult> Search(string term, DateTime now);

    /// <summary>
    /// Series with airings that haven't ended by <paramref name="now"/>, sorted by title,
    /// each with the channels it's on sorted by soonest airing.
    /// </summary>
    IReadOnlyList<UpcomingSeries> GetUpcomingSeries(DateTime now);
}
