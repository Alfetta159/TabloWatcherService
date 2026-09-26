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
        IReadOnlyList<(string Name, string Normalized)> Cast,
        IReadOnlyList<string> Genres);

    // One series' or movie's airings (soonest first), with its series/movie object if the
    // device returned one.
    private record TitleAirings<TDetails>(string Path, string Title, TDetails? Details, IReadOnlyList<Airing> Airings)
        where TDetails : class;

    private record Snapshot(
        IReadOnlyList<ChannelAirings> Channels,
        IReadOnlyList<SearchEntry> SearchEntries,
        IReadOnlyList<TitleAirings<SeriesDetails>> Series,
        IReadOnlyList<TitleAirings<MovieDetails>> Movies,
        IReadOnlyList<UpcomingSportsEvent> SportsEvents,
        IReadOnlyDictionary<string, Airing> AiringsByPath,
        IReadOnlyDictionary<string, TitleAirings<MovieDetails>> MoviesByPath,
        GuideDetails Details);

    // Assigned wholesale by Replace(), never mutated in place, so a concurrent reader
    // always sees one complete, internally-consistent snapshot with no locking needed. (The
    // one exception is an airing's Schedule - see UpdateSchedule.)
    private volatile Snapshot _snapshot = new(
        [], [], [], [], [],
        new Dictionary<string, Airing>(),
        new Dictionary<string, TitleAirings<MovieDetails>>(),
        new GuideDetails(
            new Dictionary<string, GuideSeries>(),
            new Dictionary<string, GuideMovie>(),
            new Dictionary<string, GuideSport>()));

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

        _snapshot = new Snapshot(
            channels,
            searchEntries,
            seriesAirings,
            movieAirings,
            sportsEvents,
            airings.DistinctBy(a => a.Path).ToDictionary(a => a.Path),
            movieAirings.ToDictionary(m => m.Path),
            details);
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
                results.Add(new AiringSearchResult(entry.Airing, matchedFields, matchedCast, entry.Genres));
            }
        }

        return results;
    }

    public IReadOnlyList<UpcomingTitle<SeriesDetails>> GetUpcomingSeries(DateTime now) => Upcoming(_snapshot.Series, now);

    public IReadOnlyList<UpcomingTitle<MovieDetails>> GetUpcomingMovies(DateTime now) => Upcoming(_snapshot.Movies, now);

    public IReadOnlyList<UpcomingSportsEvent> GetUpcomingSportsEvents(DateTime now) =>
        _snapshot.SportsEvents.Where(e => HasNotEnded(e.Airing, now)).ToList();

    public UpcomingTitle<MovieDetails>? GetUpcomingMovie(string moviePath, DateTime now) =>
        _snapshot.MoviesByPath.TryGetValue(moviePath, out var movie) ? Upcoming([movie], now).FirstOrDefault() : null;

    public IReadOnlyList<ScheduledAiring> GetScheduledAirings(DateTime now)
    {
        var snapshot = _snapshot;
        return snapshot.AiringsByPath.Values
            .Where(a => HasNotEnded(a, now) && a.Schedule is { } schedule && (schedule.IsScheduled || schedule.IsConflict))
            .OrderBy(a => a.AiringDetails.Datetime)
            .Select(a => new ScheduledAiring(
                a,
                SeriesFor(a, snapshot.Details),
                MovieFor(a, snapshot.Details),
                SportFor(a, snapshot.Details)))
            .ToList();
    }

    public Airing? GetAiring(string airingPath) => _snapshot.AiringsByPath.GetValueOrDefault(airingPath);

    public IReadOnlyList<Airing> GetMovieAirings(string moviePath) =>
        _snapshot.MoviesByPath.TryGetValue(moviePath, out var movie) ? movie.Airings : [];

    // Swapping one reference on an airing that every list in the snapshot shares, rather than
    // rebuilding the snapshot: a reader sees either the old schedule or the new one, never a
    // mix, and the change shows everywhere (grid, search, pills) at once. The next full
    // refresh replaces it with whatever the device reports anyway.
    public void UpdateSchedule(string airingPath, AiringSchedule schedule)
    {
        if (_snapshot.AiringsByPath.TryGetValue(airingPath, out var airing))
        {
            airing.Schedule = schedule;
        }
    }

    public IReadOnlyList<string> GetSeriesGenres() => GenresOf(_snapshot.Series.Select(s => s.Details?.Genres));

    public IReadOnlyList<string> GetMovieGenres() => GenresOf(_snapshot.Movies.Select(m => m.Details?.Genres));

    public IReadOnlyList<string> GetSportsGenres() => GenresOf(_snapshot.SportsEvents.Select(e => e.Sport?.Genres));

    public IReadOnlyList<string> GetAllGenres() =>
        GenresOf(
            _snapshot.Series.Select(s => s.Details?.Genres)
                .Concat(_snapshot.Movies.Select(m => m.Details?.Genres))
                .Concat(_snapshot.SportsEvents.Select(e => e.Sport?.Genres)));

    private static List<string> GenresOf(IEnumerable<string[]?> genreLists) =>
        genreLists
            .Where(genres => genres is not null)
            .SelectMany(genres => genres!)
            .Where(g => !string.IsNullOrWhiteSpace(g))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

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
                    .ToList(),
                t.Airings.Where(a => HasNotEnded(a, now)).ToList()))
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
        // An airing only ever belongs to one of series/movie/sport, so only one of these is
        // ever non-null.
        var genres = series?.Genres ?? movie?.Genres ?? sport?.Genres ?? [];

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
                .ToList(),
            genres);
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
