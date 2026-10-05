using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Keyword recordings (see <see cref="KeywordRecordingService"/>), set up from the Search page:
/// list, preview what conditions would match, create (which schedules its matches straight
/// away) and delete.
/// </summary>
[ApiController]
[Route("api/keyword-recordings")]
public class KeywordRecordingsController(
    IKeywordRulesStore rules,
    IAiringsStore airings,
    KeywordRecordingService keywordRecordings) : ControllerBase
{
    // A preview lists this many matches at most; the count is always the full one.
    private const int PreviewLimit = 50;

    private const int MaxFieldLength = 100;

    public record CriteriaRequest(string? Director, string? Actor, string? DescriptionContains, string? DescriptionExcludes)
    {
        public KeywordCriteria ToCriteria() => new KeywordCriteria(Director, Actor, DescriptionContains, DescriptionExcludes).Trimmed();
    }

    public record CreateRequest(string? Name, string? Director, string? Actor, string? DescriptionContains, string? DescriptionExcludes)
        : CriteriaRequest(Director, Actor, DescriptionContains, DescriptionExcludes);

    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        // Null until the guide has loaded, when the counts don't mean anything yet.
        updatedAt = airings.LastUpdated,
        items = rules.GetAll()
            .OrderBy(r => r.Name, StringComparer.CurrentCultureIgnoreCase)
            .Select(Summary),
    });

    /// <summary>What these conditions match in the guide right now, soonest first.</summary>
    [HttpPost("preview")]
    public IActionResult Preview([FromBody] CriteriaRequest request)
    {
        var criteria = request.ToCriteria();
        if (Validate(criteria) is { } problem)
        {
            return ValidationProblem(new ValidationProblemDetails(problem));
        }

        var matches = keywordRecordings.Matches(criteria);
        return Ok(new
        {
            updatedAt = airings.LastUpdated,
            count = matches.Count,
            items = matches.Take(PreviewLimit).Select(Item),
        });
    }

    /// <summary>Saves a keyword recording and schedules what it matches.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRequest request)
    {
        var criteria = request.ToCriteria();
        if (Validate(criteria) is { } problem)
        {
            return ValidationProblem(new ValidationProblemDetails(problem));
        }

        var name = string.IsNullOrWhiteSpace(request.Name) ? DefaultName(criteria) : request.Name.Trim();
        var rule = rules.Add(name, criteria);
        var scheduled = await keywordRecordings.ApplyAsync(rule.Id);

        return Ok(new { scheduled, item = Summary(rules.Get(rule.Id) ?? rule) });
    }

    /// <summary>
    /// Deletes a keyword recording - with <paramref name="cancelScheduled"/>, also cancelling
    /// the upcoming airings it scheduled.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, [FromQuery] bool cancelScheduled = false)
    {
        var rule = rules.Get(id);
        if (rule is null)
        {
            return NotFound();
        }

        var (cancelled, failed) = cancelScheduled ? await keywordRecordings.CancelScheduledAsync(rule) : (0, 0);
        rules.Remove(id);

        return Ok(new { cancelled, failed });
    }

    private object Summary(KeywordRule rule)
    {
        var now = DateTime.UtcNow;
        return new
        {
            id = rule.Id,
            name = rule.Name,
            director = rule.Criteria.Director,
            actor = rule.Criteria.Actor,
            descriptionContains = rule.Criteria.DescriptionContains,
            descriptionExcludes = rule.Criteria.DescriptionExcludes,
            createdAt = rule.CreatedAt,
            // Everything upcoming it matches, whoever set it to record.
            matchCount = keywordRecordings.Matches(rule.Criteria).Count,
            // The upcoming ones it scheduled itself and that are still set to record - what
            // deleting it with cancelScheduled would cancel (less any another rule shares).
            scheduledCount = rule.Handled.Count(h =>
                h.Scheduled
                && airings.GetAiring(h.Path) is { } a
                && a.AiringDetails.Datetime > now
                && a.Schedule is { IsScheduled: true } or { IsConflict: true }),
        };
    }

    private object Item(Airing airing)
    {
        var detailed = airings.GetDetailedAiring(airing.Path);
        return ScheduleResponses.Item(new ScheduledAiring(airing, detailed?.Series, detailed?.Movie, detailed?.Sport));
    }

    private static Dictionary<string, string[]>? Validate(KeywordCriteria criteria)
    {
        var errors = new Dictionary<string, string[]>();
        if (!criteria.HasPositiveCondition)
        {
            errors[nameof(criteria.Director)] = ["Enter a director, an actor or words the description contains."];
        }

        foreach (var (field, value) in new[]
        {
            (nameof(criteria.Director), criteria.Director),
            (nameof(criteria.Actor), criteria.Actor),
            (nameof(criteria.DescriptionContains), criteria.DescriptionContains),
            (nameof(criteria.DescriptionExcludes), criteria.DescriptionExcludes),
        })
        {
            if (value is { Length: > MaxFieldLength })
            {
                errors[field] = [$"Keep it under {MaxFieldLength} characters."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    // e.g. "Directed by Ridley Scott, with Sigourney Weaver" or "“shark”, not “Jaws”".
    private static string DefaultName(KeywordCriteria criteria) =>
        string.Join(", ", new[]
        {
            criteria.Director is { } director ? $"Directed by {director}" : null,
            criteria.Actor is { } actor ? $"With {actor}" : null,
            criteria.DescriptionContains is { } contains ? $"“{contains}”" : null,
            criteria.DescriptionExcludes is { } excludes ? $"not “{excludes}”" : null,
        }.OfType<string>());
}
