namespace TabloWatcherService.Api.Models;

/// <summary>
/// What a keyword recording matches. Every condition that's set has to hold ("and"); an "or"
/// is just two keyword recordings. Names are matched whole and titles, plots and descriptions
/// at the start of a word, both ignoring case, accents and extra spaces, as Search does.
/// </summary>
/// <param name="Director">A movie director's full name.</param>
/// <param name="Actor">A cast member's full name, of a series or movie.</param>
/// <param name="TitleContains">A word or phrase the title has to contain.</param>
/// <param name="TitleExcludes">A word or phrase the title mustn't contain.</param>
/// <param name="PlotContains">A word or phrase the plot/description has to contain.</param>
/// <param name="PlotExcludes">A word or phrase the plot/description mustn't contain.</param>
/// <param name="DescriptionContains">A word or phrase the description has to contain.</param>
/// <param name="DescriptionExcludes">A word or phrase the description mustn't contain.</param>
public record KeywordCriteria(
    string? Director,
    string? Actor,
    string? TitleContains,
    string? TitleExcludes,
    string? PlotContains,
    string? PlotExcludes,
    string? DescriptionContains,
    string? DescriptionExcludes)
{
    /// <summary>
    /// A rule needs something to look for: a negative-only rule would record nearly the whole
    /// guide.
    /// </summary>
    public bool HasPositiveCondition =>
        !string.IsNullOrWhiteSpace(Director)
        || !string.IsNullOrWhiteSpace(Actor)
        || !string.IsNullOrWhiteSpace(TitleContains)
        || !string.IsNullOrWhiteSpace(PlotContains)
        || !string.IsNullOrWhiteSpace(DescriptionContains);

    public KeywordCriteria Trimmed() => new(
        Clean(Director),
        Clean(Actor),
        Clean(TitleContains),
        Clean(TitleExcludes),
        Clean(PlotContains),
        Clean(PlotExcludes),
        Clean(DescriptionContains),
        Clean(DescriptionExcludes));

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>
/// A saved keyword recording (see <see cref="Services.KeywordRecordingService"/>), with what
/// it has done so far.
/// </summary>
/// <param name="Handled">
/// Every airing it has matched and dealt with - scheduled, or found already set to record -
/// so it doesn't touch them again. That's what makes cancelling one of its airings stick.
/// </param>
public record KeywordRule(
    string Id,
    string Name,
    KeywordCriteria Criteria,
    DateTimeOffset CreatedAt,
    IReadOnlyList<HandledAiring> Handled);

/// <summary>One airing a keyword recording has dealt with.</summary>
/// <param name="End">When it ends - kept until then (plus a margin), then forgotten.</param>
/// <param name="Scheduled">Whether the keyword recording scheduled it itself (so deleting the rule can cancel it).</param>
public record HandledAiring(string Path, DateTime End, bool Scheduled);
