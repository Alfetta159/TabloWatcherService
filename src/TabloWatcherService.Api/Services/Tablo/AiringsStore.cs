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

    private record Snapshot(IReadOnlyList<ChannelAirings> Channels, IReadOnlyList<SearchEntry> SearchEntries);

    // Assigned wholesale by Replace(), never mutated in place, so a concurrent reader
    // always sees one complete, internally-consistent snapshot with no locking needed.
    private volatile Snapshot _snapshot = new([], []);

    public DateTimeOffset? LastUpdated { get; private set; }

    public void Replace(
        IReadOnlyList<Airing> airings,
        IReadOnlyDictionary<string, GuideSeries> series,
        IReadOnlyDictionary<string, GuideMovie> movies)
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
                a.SeriesPath is null ? null : series.GetValueOrDefault(a.SeriesPath)?.Series,
                a.MoviePath is null ? null : movies.GetValueOrDefault(a.MoviePath)?.Movie))
            .ToList();

        _snapshot = new Snapshot(channels, searchEntries);
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

    private static SearchEntry ToSearchEntry(Airing airing, SeriesDetails? series, MovieDetails? movie)
    {
        // The airing's own show title usually matches its series/movie title, but either can
        // be missing (a plain program has neither), so search all that are present.
        var titles = new[] { airing.AiringDetails.ShowTitle, series?.Title, movie?.Title };
        var descriptions = new[] { airing.Episode?.Description, airing.Event?.Description, series?.Description, movie?.Plot };
        var cast = (series?.Cast ?? []).Concat(movie?.Cast ?? []);

        return new SearchEntry(
            airing,
            airing.AiringDetails.Datetime.AddSeconds(airing.AiringDetails.Duration),
            NormalizeAll(titles),
            string.IsNullOrWhiteSpace(airing.Episode?.Title) ? null : NormalizeWhitespace(airing.Episode.Title),
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
