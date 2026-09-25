using System.Globalization;
using System.Text.RegularExpressions;
using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

public partial class AiringsStore : IAiringsStore
{
    private const CompareOptions MatchOptions = CompareOptions.IgnoreCase | CompareOptions.IgnoreNonSpace;

    private static readonly CompareInfo Comparer = CultureInfo.InvariantCulture.CompareInfo;

    // Everything Search looks at for one airing, with its text pre-normalized (see
    // NormalizeWhitespace) so a search doesn't redo that for every airing.
    private record SearchEntry(
        Airing Airing,
        DateTime End,
        IReadOnlyList<string> Titles,
        string? EpisodeTitle,
        IReadOnlyList<string> Descriptions,
        IReadOnlyList<(string Name, string Normalized)> Cast);

    // One series' or movie's airings (soonest first), with its series/movie object if the
    // device returned one.
    private record TitleAirings<TDetails>(string Path, string Title, TDetails? Details, IReadOnlyList<Airing> Airings)
        where TDetails : class;

    private record Snapshot(
        IReadOnlyList<ChannelAirings> Channels,
        IReadOnlyList<SearchEntry> SearchEntries,
        IReadOnlyList<TitleAirings<SeriesDetails>> Series,
        IReadOnlyList<TitleAirings<MovieDetails>> Movies,
        IReadOnlyList<UpcomingSportsEvent> SportsEvents);

    // Assigned wholesale by Replace(), never mutated in place, so a concurrent reader
    // always sees one complete, internally-consistent snapshot with no locking needed.
    private volatile Snapshot _snapshot = new([], [], [], [], []);

    public DateTimeOffset? LastUpdated { get; private set; }

    public void Replace(IReadOnlyList<Airing> airings, GuideDetails details)
    {
        var channels = airings
            .GroupBy(a => a.AiringDetails.Channel.ObjectId)
            .Select(group => new ChannelAirings(
                group.First().AiringDetails.Channel,
                group.OrderBy(a => a.AiringDetails.Datetime).ToList()))
            .OrderBy(c => c.Channel.Channel.Major)
            .ThenBy(c => c.Channel.Channel.Minor)
            .ToList();

        var searchEntries = airings
            .OrderBy(a => a.AiringDetails.Datetime)
            .ThenBy(a => a.AiringDetails.Channel.Channel.Major)
            .ThenBy(a => a.AiringDetails.Channel.Channel.Minor)
            .Select(a => ToSearchEntry(
                a,
                SeriesFor(a, details),
                MovieFor(a, details),
                SportFor(a, details)))
            .ToList();

        var seriesAirings = GroupByTitle(airings, a => a.SeriesPath, a => SeriesFor(a, details), s => s.Title);
        var movieAirings = GroupByTitle(airings, a => a.MoviePath, a => MovieFor(a, details), m => m.Title);

        var sportsEvents = airings
            .Where(a => a.Event is not null)
            .OrderBy(a => a.AiringDetails.Datetime)
            .ThenBy(a => a.AiringDetails.Channel.Channel.Major)
            .ThenBy(a => a.AiringDetails.Channel.Channel.Minor)
            .Select(a => new UpcomingSportsEvent(a, SportFor(a, details)))
            .ToList();

        _snapshot = new Snapshot(channels, searchEntries, seriesAirings, movieAirings, sportsEvents);
        LastUpdated = DateTimeOffset.UtcNow;
    }

    public IReadOnlyList<ChannelAirings> GetGrid(DateTime from, DateTime to) =>
        _snapshot.Channels
            .Select(c => c with
            {
                Airings = c.Airings
                    .Where(a => a.AiringDetails.Datetime < to
                        && a.AiringDetails.Datetime.AddSeconds(a.AiringDetails.Duration) > from)
                    .ToList(),
            })
            .ToList();

    public IReadOnlyList<AiringSearchResult> Search(string term, DateTime now)
    {
        var normalizedTerm = NormalizeWhitespace(term);
        if (normalizedTerm.Length == 0)
        {
            return [];
        }

        bool Matches(string? text) => text is not null && ContainsAtWordStart(text, normalizedTerm);

        var results = new List<AiringSearchResult>();
        foreach (var entry in _snapshot.SearchEntries)
        {
            if (entry.End <= now)
            {
                continue;
            }

            var matchedFields = new List<string>();
            if (entry.Titles.Any(Matches))
            {
                matchedFields.Add(SearchFields.Title);
            }
            if (Matches(entry.EpisodeTitle))
            {
                matchedFields.Add(SearchFields.EpisodeTitle);
            }
            if (entry.Descriptions.Any(Matches))
            {
                matchedFields.Add(SearchFields.Description);
            }

            var matchedCast = entry.Cast.Where(c => Matches(c.Normalized)).Select(c => c.Name).ToList();
            if (matchedCast.Count > 0)
            {
                matchedFields.Add(SearchFields.Cast);
            }

            if (matchedFields.Count > 0)
            {
                results.Add(new AiringSearchResult(entry.Airing, matchedFields, matchedCast));
            }
        }

        return results;
    }

    public IReadOnlyList<UpcomingTitle<SeriesDetails>> GetUpcomingSeries(DateTime now) => Upcoming(_snapshot.Series, now);

    public IReadOnlyList<UpcomingTitle<MovieDetails>> GetUpcomingMovies(DateTime now) => Upcoming(_snapshot.Movies, now);

    public IReadOnlyList<UpcomingSportsEvent> GetUpcomingSportsEvents(DateTime now) =>
        _snapshot.SportsEvents.Where(e => HasNotEnded(e.Airing, now)).ToList();

    private static bool HasNotEnded(Airing airing, DateTime now) =>
        airing.AiringDetails.Datetime.AddSeconds(airing.AiringDetails.Duration) > now;

    private static SeriesDetails? SeriesFor(Airing airing, GuideDetails details) =>
        airing.SeriesPath is null ? null : details.Series.GetValueOrDefault(airing.SeriesPath)?.Series;

    private static MovieDetails? MovieFor(Airing airing, GuideDetails details) =>
        airing.MoviePath is null ? null : details.Movies.GetValueOrDefault(airing.MoviePath)?.Movie;

    private static SportDetails? SportFor(Airing airing, GuideDetails details) =>
        airing.SportPath is null ? null : details.Sports.GetValueOrDefault(airing.SportPath)?.Sport;

    // Groups airings by their series/movie path, sorted by title. Falls back to the airing's
    // show title when the series/movie object is missing or untitled.
    private static List<TitleAirings<TDetails>> GroupByTitle<TDetails>(
        IEnumerable<Airing> airings,
        Func<Airing, string?> path,
        Func<Airing, TDetails?> detailsFor,
        Func<TDetails, string> titleOf)
        where TDetails : class =>
        airings
            .Where(a => path(a) is not null)
            .GroupBy(a => path(a)!)
            .Select(group =>
            {
                var ordered = group.OrderBy(a => a.AiringDetails.Datetime).ToList();
                var details = detailsFor(ordered[0]);
                var title = details is not null && !string.IsNullOrWhiteSpace(titleOf(details))
                    ? titleOf(details)
                    : ordered[0].AiringDetails.ShowTitle;
                return new TitleAirings<TDetails>(group.Key, title, details, ordered);
            })
            .OrderBy(t => SortableTitle(t.Title), StringComparer.CurrentCultureIgnoreCase)
            .ToList();

    private static List<UpcomingTitle<TDetails>> Upcoming<TDetails>(IEnumerable<TitleAirings<TDetails>> titles, DateTime now)
        where TDetails : class =>
        titles
            .Select(t => new UpcomingTitle<TDetails>(
                t.Path,
                t.Title,
                t.Details,
                t.Airings
                    .Where(a => HasNotEnded(a, now))
                    .GroupBy(a => a.AiringDetails.Channel.ObjectId)
                    .Select(group => new UpcomingChannel(
                        group.First().AiringDetails.Channel,
                        group.First().AiringDetails.Datetime,
                        group.Count()))
                    .OrderBy(c => c.NextAiring)
                    .ToList()))
            .Where(t => t.Channels.Count > 0)
            .ToList();

    // Sorts "The Office" with the Os, like a TV guide or library would.
    private static string SortableTitle(string title)
    {
        foreach (var article in (string[])["The ", "A ", "An "])
        {
            if (title.StartsWith(article, StringComparison.OrdinalIgnoreCase) && title.Length > article.Length)
            {
                return title[article.Length..];
            }
        }

        return title;
    }

    // Only counts a match that starts a word, so "ncis" finds "NCIS: Los Angeles" but not
    // "John Francis Daley"; a term can still be a word prefix ("han" finds "Tom Hanks").
    private static bool ContainsAtWordStart(string text, string term)
    {
        for (var start = 0; start < text.Length; start++)
        {
            var index = Comparer.IndexOf(text, term, start, MatchOptions);
            if (index < 0)
            {
                return false;
            }
            if (index == 0 || !char.IsLetterOrDigit(text[index - 1]))
            {
                return true;
            }
            start = index;
        }

        return false;
    }

    private static SearchEntry ToSearchEntry(Airing airing, SeriesDetails? series, MovieDetails? movie, SportDetails? sport)
    {
        // The airing's own show title usually matches its series/movie/sport title, but either
        // can be missing (a plain program has neither), so search all that are present.
        var titles = new[] { airing.AiringDetails.ShowTitle, series?.Title, movie?.Title, sport?.Title };
        var descriptions = new[]
        {
            airing.Episode?.Description, airing.Event?.Description, series?.Description, movie?.Plot, sport?.Description,
        };
        // A sports event's own title (e.g. "Northwestern at Indiana") plays the part of an
        // episode title.
        var episodeTitle = airing.Episode?.Title ?? airing.Event?.Title;
        var cast = (series?.Cast ?? []).Concat(movie?.Cast ?? []);

        return new SearchEntry(
            airing,
            airing.AiringDetails.Datetime.AddSeconds(airing.AiringDetails.Duration),
            NormalizeAll(titles),
            string.IsNullOrWhiteSpace(episodeTitle) ? null : NormalizeWhitespace(episodeTitle),
            NormalizeAll(descriptions),
            cast
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(name => (name.Trim(), NormalizeWhitespace(name)))
                .ToList());
    }

    private static List<string> NormalizeAll(IEnumerable<string?> texts) =>
        texts
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => NormalizeWhitespace(t!))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    // Trims and collapses every run of whitespace (including line breaks in descriptions) to
    // a single space, on both the search term and the text searched, so "Tom  Hanks" and
    // "Tom\nHanks" both match "Tom Hanks".
    private static string NormalizeWhitespace(string text) => WhitespaceRun().Replace(text.Trim(), " ");

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRun();
}
