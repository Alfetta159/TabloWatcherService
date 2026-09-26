using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// The series, movies, sports and programs recordings belong to, each keyed by its
/// /recordings/... path - where their artwork and descriptions live.
/// </summary>
public record RecordingParents(
    IReadOnlyDictionary<string, GuideSeries> Series,
    IReadOnlyDictionary<string, GuideMovie> Movies,
    IReadOnlyDictionary<string, GuideSport> Sports,
    IReadOnlyDictionary<string, GuideProgram> Programs)
{
    public static readonly RecordingParents Empty = new(
        new Dictionary<string, GuideSeries>(),
        new Dictionary<string, GuideMovie>(),
        new Dictionary<string, GuideSport>(),
        new Dictionary<string, GuideProgram>());
}

public static class RecordingKinds
{
    public const string TvShow = "tv";
    public const string Movie = "movie";
    public const string Sport = "sport";
    public const string Program = "program";
}

/// <summary>
/// What the Recordings page shows as one card: every recorded episode of a series (or
/// airing of a program), or a single recorded movie or sports event. At most one of
/// Series/Movie/Sport is set, matching <see cref="Kind"/>, and it may be null if the device
/// didn't return the parent.
/// </summary>
public record RecordingGroup(
    string Key,
    string Kind,
    string Title,
    // Newest first.
    IReadOnlyList<RecordedAiring> Recordings,
    SeriesDetails? Series,
    MovieDetails? Movie,
    SportDetails? Sport);

/// <summary>
/// In-memory cache of the device's recordings, kept by <see cref="RecordingsRefreshService"/>.
/// Like <see cref="IAiringsStore"/>, Replace swaps one immutable snapshot, so readers never
/// see a half-updated set.
/// </summary>
public interface IRecordingsStore
{
    DateTimeOffset? LastUpdated { get; }

    /// <summary>Every recording last fetched, by path - so a refresh only re-fetches what may have changed.</summary>
    IReadOnlyDictionary<string, RecordedAiring> Recordings { get; }

    RecordingParents Parents { get; }

    void Replace(IReadOnlyList<RecordedAiring> recordings, RecordingParents parents);

    /// <summary>Adds or replaces one recording (e.g. re-read after it was stopped), keeping the rest.</summary>
    void Upsert(RecordedAiring recording);

    /// <summary>Drops one recording (e.g. after it was deleted), keeping the rest.</summary>
    void Remove(string recordingPath);

    /// <summary>The guide path of the series/movie/sport/program a recording belongs to, if known.</summary>
    string? GuidePathOf(RecordedAiring recording);

    IReadOnlyList<RecordingGroup> GetGroups();
}

public class RecordingsStore : IRecordingsStore
{
    private record Snapshot(
        IReadOnlyDictionary<string, RecordedAiring> Recordings,
        RecordingParents Parents,
        IReadOnlyList<RecordingGroup> Groups);

    private volatile Snapshot _snapshot = new(new Dictionary<string, RecordedAiring>(), RecordingParents.Empty, []);

    public DateTimeOffset? LastUpdated { get; private set; }

    public IReadOnlyDictionary<string, RecordedAiring> Recordings => _snapshot.Recordings;

    public RecordingParents Parents => _snapshot.Parents;

    public IReadOnlyList<RecordingGroup> GetGroups() => _snapshot.Groups;

    public void Replace(IReadOnlyList<RecordedAiring> recordings, RecordingParents parents)
    {
        _snapshot = new Snapshot(
            recordings.DistinctBy(r => r.Path).ToDictionary(r => r.Path),
            parents,
            Group(recordings, parents));
        LastUpdated = DateTimeOffset.UtcNow;
    }

    // Both rebuild the snapshot from the current one, so a concurrent full refresh may win or
    // lose the race - harmless, since it reads the device's own current state anyway.
    public void Upsert(RecordedAiring recording) =>
        Replace([.. _snapshot.Recordings.Values.Where(r => r.Path != recording.Path), recording], _snapshot.Parents);

    public void Remove(string recordingPath) =>
        Replace([.. _snapshot.Recordings.Values.Where(r => r.Path != recordingPath)], _snapshot.Parents);

    public string? GuidePathOf(RecordedAiring recording)
    {
        var parents = _snapshot.Parents;
        return (recording.SeriesPath is { } series ? parents.Series.GetValueOrDefault(series)?.GuidePath : null)
            ?? (recording.MoviePath is { } movie ? parents.Movies.GetValueOrDefault(movie)?.GuidePath : null)
            ?? (recording.SportPath is { } sport ? parents.Sports.GetValueOrDefault(sport)?.GuidePath : null)
            ?? (recording.ProgramPath is { } program ? parents.Programs.GetValueOrDefault(program)?.GuidePath : null);
    }

    // Series and programs group their recordings into one card, like the Tablo apps do;
    // movies group by movie (usually one recording each); each sports event is its own card,
    // since which game it was matters more than which sport.
    private static List<RecordingGroup> Group(IReadOnlyList<RecordedAiring> recordings, RecordingParents parents)
    {
        var groups = new List<RecordingGroup>();

        foreach (var series in recordings.Where(r => r.SeriesPath is not null).GroupBy(r => r.SeriesPath!))
        {
            var details = parents.Series.GetValueOrDefault(series.Key)?.Series;
            groups.Add(NewGroup(series.Key, RecordingKinds.TvShow, details?.Title, series, details, null, null));
        }

        foreach (var program in recordings.Where(r => r.ProgramPath is not null).GroupBy(r => r.ProgramPath!))
        {
            var title = parents.Programs.GetValueOrDefault(program.Key)?.Program.Title;
            groups.Add(NewGroup(program.Key, RecordingKinds.Program, title, program, null, null, null));
        }

        foreach (var movie in recordings.Where(r => r.MoviePath is not null).GroupBy(r => r.MoviePath!))
        {
            var details = parents.Movies.GetValueOrDefault(movie.Key)?.Movie;
            groups.Add(NewGroup(movie.Key, RecordingKinds.Movie, details?.Title, movie, null, details, null));
        }

        foreach (var sportsEvent in recordings.Where(r => r.SportPath is not null))
        {
            var sport = parents.Sports.GetValueOrDefault(sportsEvent.SportPath!)?.Sport;
            groups.Add(NewGroup(sportsEvent.Path, RecordingKinds.Sport, sportsEvent.Event?.Title, [sportsEvent], null, null, sport));
        }

        return groups;
    }

    private static RecordingGroup NewGroup(
        string key,
        string kind,
        string? title,
        IEnumerable<RecordedAiring> recordings,
        SeriesDetails? series,
        MovieDetails? movie,
        SportDetails? sport)
    {
        var newestFirst = recordings.OrderByDescending(r => r.AiringDetails.Datetime).ToList();
        // Every recording carries the show's title too, for a parent the device didn't return.
        var resolvedTitle = string.IsNullOrWhiteSpace(title) ? newestFirst[0].AiringDetails.ShowTitle : title;
        return new RecordingGroup(key, kind, resolvedTitle, newestFirst, series, movie, sport);
    }
}
