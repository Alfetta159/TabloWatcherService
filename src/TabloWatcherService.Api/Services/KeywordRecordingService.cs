using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Services;

/// <summary>
/// Keyword recordings (<see cref="KeywordRule"/>): after every guide refresh, and as soon as
/// one is created, schedules each upcoming airing a rule matches - one PATCH per airing, as
/// the Record button does.
/// <para>
/// Each airing is dealt with once per rule and remembered (<see cref="KeywordRule.Handled"/>):
/// one already set to record (by a series rule, say) is left alone, and one the user cancels
/// afterwards isn't scheduled again. Only the first airing of a movie, or of an episode (by its
/// TMS id), is scheduled - re-airs of something already being recorded are skipped.
/// </para>
/// </summary>
public class KeywordRecordingService(
    IKeywordRulesStore rules,
    IAiringsStore airings,
    ICurrentTabloDeviceResolver deviceResolver,
    ILogger<KeywordRecordingService> logger)
{
    // A refresh and a newly created rule mustn't schedule the same airings at once - and the
    // device's embedded server copes badly with concurrent requests anyway.
    private readonly SemaphoreSlim _applying = new(1, 1);

    /// <summary>The upcoming airings a rule's conditions match right now, soonest first.</summary>
    public IReadOnlyList<Airing> Matches(KeywordCriteria criteria) => airings.FindKeywordMatches(criteria, DateTime.UtcNow);

    /// <summary>Schedules what every rule (or just <paramref name="ruleId"/>) matches.</summary>
    /// <returns>How many airings were scheduled.</returns>
    public async Task<int> ApplyAsync(string? ruleId = null, CancellationToken cancellationToken = default)
    {
        var toApply = rules.GetAll().Where(r => ruleId is null || r.Id == ruleId).ToList();
        if (toApply.Count == 0 || airings.LastUpdated is null)
        {
            return 0;
        }

        await _applying.WaitAsync(cancellationToken);
        try
        {
            ITabloDeviceClient? client = null;
            var scheduledCount = 0;

            foreach (var rule in toApply)
            {
                var handled = rule.Handled.Select(h => h.Path).ToHashSet();
                var results = new List<HandledAiring>();
                // Movies and episodes this rule already covered - in this pass or an earlier
                // one - so a re-air isn't recorded too.
                var covered = rule.Handled
                    .Select(h => airings.GetAiring(h.Path))
                    .Select(a => a is null ? null : Identity(a))
                    .OfType<string>()
                    .ToHashSet();

                foreach (var airing in Matches(rule.Criteria))
                {
                    if (handled.Contains(airing.Path))
                    {
                        continue;
                    }

                    var end = airing.AiringDetails.Datetime.AddSeconds(airing.AiringDetails.Duration);
                    var identity = Identity(airing);
                    var alreadyCovered = identity is not null && !covered.Add(identity);
                    var schedule = airing.Schedule;

                    // Already set to record, covered by some other rule (skipped as a duplicate,
                    // say), or a re-air of something this pass scheduled: nothing to do but
                    // remember it.
                    if (alreadyCovered || schedule is { IsScheduled: true } or { IsConflict: true } or { IsSkipped: true })
                    {
                        results.Add(new HandledAiring(airing.Path, end, Scheduled: false));
                        continue;
                    }

                    client ??= await deviceResolver.ResolveAsync();
                    if (client is null)
                    {
                        logger.LogWarning("Couldn't resolve a Tablo device; keyword recordings will be applied at the next refresh");
                        break;
                    }

                    try
                    {
                        var response = await client.SetAiringScheduledAsync(airing.Path.TrimStart('/'), new ScheduleRequest(true));
                        if (response is { IsSuccessStatusCode: true, Content.Schedule: { } updated })
                        {
                            airings.UpdateSchedule(airing.Path, updated);
                            results.Add(new HandledAiring(airing.Path, end, Scheduled: true));
                            scheduledCount++;
                        }
                        else
                        {
                            // Not remembered, so the next refresh tries again.
                            logger.LogWarning(
                                "Keyword recording {Rule} couldn't schedule {Path}: {Status}", rule.Name, airing.Path, response.StatusCode);
                            if (identity is not null) covered.Remove(identity);
                        }
                    }
                    catch (HttpRequestException ex)
                    {
                        logger.LogWarning(ex, "Keyword recording {Rule} couldn't schedule {Path}", rule.Name, airing.Path);
                        if (identity is not null) covered.Remove(identity);
                    }
                }

                rules.RecordResults(rule.Id, results);
            }

            if (scheduledCount > 0)
            {
                logger.LogInformation("Keyword recordings scheduled {Count} airing(s)", scheduledCount);
            }

            return scheduledCount;
        }
        finally
        {
            _applying.Release();
        }
    }

    /// <summary>
    /// Cancels the upcoming airings a rule scheduled itself that are still set to record -
    /// unless another keyword recording also scheduled them.
    /// </summary>
    /// <returns>How many were cancelled, and how many couldn't be.</returns>
    public async Task<(int Cancelled, int Failed)> CancelScheduledAsync(KeywordRule rule)
    {
        var now = DateTime.UtcNow;
        var claimedByOthers = rules.GetAll()
            .Where(r => r.Id != rule.Id)
            .SelectMany(r => r.Handled.Where(h => h.Scheduled).Select(h => h.Path))
            .ToHashSet();
        var toCancel = rule.Handled
            .Where(h => h.Scheduled && !claimedByOthers.Contains(h.Path))
            .Select(h => airings.GetAiring(h.Path))
            .Where(a => a is not null
                && a.AiringDetails.Datetime > now
                && a.Schedule is { IsScheduled: true } or { IsConflict: true })
            .ToList();
        if (toCancel.Count == 0)
        {
            return (0, 0);
        }

        await _applying.WaitAsync();
        try
        {
            var client = await deviceResolver.ResolveAsync();
            if (client is null)
            {
                return (0, toCancel.Count);
            }

            int cancelled = 0, failed = 0;
            foreach (var airing in toCancel)
            {
                try
                {
                    var response = await client.SetAiringScheduledAsync(airing!.Path.TrimStart('/'), new ScheduleRequest(false));
                    if (response is { IsSuccessStatusCode: true, Content.Schedule: { } updated })
                    {
                        airings.UpdateSchedule(airing.Path, updated);
                        cancelled++;
                    }
                    else
                    {
                        failed++;
                    }
                }
                catch (HttpRequestException)
                {
                    failed++;
                }
            }

            return (cancelled, failed);
        }
        finally
        {
            _applying.Release();
        }
    }

    // What makes two airings "the same thing": a movie by its title and year - the guide can
    // list one film under two movie objects (and TMS ids), e.g. both 1939 "Stagecoach"s - or an
    // episode by its TMS id. Null for anything else (sports events and programs air once each).
    private static string? Identity(Airing airing) =>
        airing.MoviePath is { } movie
            ? airing.MovieAiring is { ReleaseYear: > 0 } m
                ? $"movie:{airing.AiringDetails.ShowTitle.Trim().ToUpperInvariant()}:{m.ReleaseYear}"
                : movie
        : airing.Episode is { TmsId.Length: > 0 } episode ? $"episode:{episode.TmsId}"
        : null;
}
