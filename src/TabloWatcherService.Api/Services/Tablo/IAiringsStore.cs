using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// One channel's airings, already filtered to a requested time window.
/// </summary>
public record ChannelAirings(GuideChannel Channel, IReadOnlyList<Airing> Airings);

/// <summary>
/// One airing that matched a search, with which of its fields matched (see
/// <see cref="SearchFields"/>), for a cast match the matching cast members' names, and the
/// genres of its series/movie/sport (for the Search page's own tag filters).
/// </summary>
public record AiringSearchResult(
    Airing Airing,
    IReadOnlyList<string> MatchedFields,
    IReadOnlyList<string> MatchedCast,
    IReadOnlyList<string> Genres);

/// <summary>
/// The series, movie and sport objects the guide's airings point back to (via
/// <see cref="Airing.SeriesPath"/>, <see cref="Airing.MoviePath"/> and
/// <see cref="Airing.SportPath"/>), each keyed by its path - the source of artwork,
/// descriptions and cast, none of which are on the airings themselves.
/// </summary>
public record GuideDetails(
    IReadOnlyDictionary<string, GuideSeries> Series,
    IReadOnlyDictionary<string, GuideMovie> Movies,
    IReadOnlyDictionary<string, GuideSport> Sports);

/// <summary>
/// A series or movie with at least one airing that hasn't ended yet. <see cref="Details"/> is
/// null if its series/movie object couldn't be fetched from the device (the airings still
/// identify it).
/// </summary>
public record UpcomingTitle<TDetails>(
    string Path,
    string Title,
    TDetails? Details,
    IReadOnlyList<UpcomingChannel> Channels,
    // Every airing that hasn't ended, soonest first.
    IReadOnlyList<Airing> Airings)
    where TDetails : class;

/// <summary>One channel a title is coming up on: its soonest airing there and how many there are.</summary>
public record UpcomingChannel(GuideChannel Channel, DateTime NextAiring, int AiringCount);

/// <summary>
/// A sports event airing that hasn't ended yet, with the sport it belongs to (null if that
/// couldn't be fetched).
/// </summary>
public record UpcomingSportsEvent(Airing Airing, SportDetails? Sport);

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
/// series, movie and sports lists. Populated periodically by <see cref="AiringsRefreshService"/>; readers see the previous snapshot
/// until the next full refresh completes - "Replace" swaps a single reference rather than
/// mutating in place, so a reader can never observe a half-updated set of channels.
/// </summary>
public interface IAiringsStore
{
    DateTimeOffset? LastUpdated { get; }

    /// <param name="airings">Every airing in the guide.</param>
    /// <param name="details">The series, movies and sports those airings belong to.</param>
    void Replace(IReadOnlyList<Airing> airings, GuideDetails details);

    /// <summary>Channels sorted by channel number, each with airings overlapping [from, to).</summary>
    IReadOnlyList<ChannelAirings> GetGrid(DateTime from, DateTime to);

    /// <summary>
    /// Airings that haven't ended by <paramref name="now"/> whose show/episode/game title,
    /// description or cast contains <paramref name="term"/> at the start of a word, soonest
    /// first. Matching ignores case, accents and runs of whitespace, so "tom  hanks" finds
    /// "Tom Hanks".
    /// </summary>
    IReadOnlyList<AiringSearchResult> Search(string term, DateTime now);

    /// <summary>
    /// Series with airings that haven't ended by <paramref name="now"/>, sorted by title,
    /// each with the channels it's on sorted by soonest airing.
    /// </summary>
    IReadOnlyList<UpcomingTitle<SeriesDetails>> GetUpcomingSeries(DateTime now);

    /// <summary>Likewise for movies.</summary>
    IReadOnlyList<UpcomingTitle<MovieDetails>> GetUpcomingMovies(DateTime now);

    /// <summary>Sports event airings that haven't ended by <paramref name="now"/>, soonest first.</summary>
    IReadOnlyList<UpcomingSportsEvent> GetUpcomingSportsEvents(DateTime now);

    /// <summary>One movie (by its path, e.g. "/guide/movies/123") as in <see cref="GetUpcomingMovies"/>, or null if it has no upcoming airings.</summary>
    UpcomingTitle<MovieDetails>? GetUpcomingMovie(string moviePath, DateTime now);

    /// <summary>An airing in the guide by its path, or null if the guide doesn't have it.</summary>
    Airing? GetAiring(string airingPath);

    /// <summary>Every airing of a movie in the guide, past or upcoming.</summary>
    IReadOnlyList<Airing> GetMovieAirings(string moviePath);

    /// <summary>
    /// Records a schedule change the device has confirmed (see ITabloDeviceClient
    /// .SetAiringScheduledAsync), so it shows right away instead of at the next refresh.
    /// </summary>
    void UpdateSchedule(string airingPath, AiringSchedule schedule);

    /// <summary>
    /// Every genre appearing on any series currently in the guide, alphabetized -
    /// regardless of whether it's blocked (see IBlockedTagsStore) or has already aired, so
    /// a tag doesn't disappear from the filter UI just because every airing carrying it
    /// currently happens to be blocked or in the past. Scoped to series only (not movies or
    /// sports) so, e.g., the TV Shows page doesn't offer a tag that only ever appears on
    /// movies.
    /// </summary>
    IReadOnlyList<string> GetSeriesGenres();

    /// <summary>Likewise for movies.</summary>
    IReadOnlyList<string> GetMovieGenres();

    /// <summary>Likewise for sports.</summary>
    IReadOnlyList<string> GetSportsGenres();

    /// <summary>
    /// Every genre from any of the above combined, alphabetized - for the Search page, which
    /// isn't scoped to one content type the way TV Shows/Movies/Sports are.
    /// </summary>
    IReadOnlyList<string> GetAllGenres();
}
