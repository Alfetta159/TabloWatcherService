using System.Text.Json;
using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services;

/// <summary>
/// The saved keyword recordings (<see cref="KeywordRule"/>) and what each has handled - a
/// global setting, like <see cref="IBlockedTagsStore"/>.
/// </summary>
public interface IKeywordRulesStore
{
    IReadOnlyList<KeywordRule> GetAll();

    KeywordRule? Get(string id);

    KeywordRule Add(string name, KeywordCriteria criteria);

    bool Remove(string id);

    /// <summary>
    /// Adds the airings one pass over a rule's matches dealt with, and forgets ones that
    /// ended over a day ago, so the file doesn't grow forever.
    /// </summary>
    void RecordResults(string id, IReadOnlyCollection<HandledAiring> handled);
}

/// <summary>
/// Persisted to a small JSON file next to the app (like blocked-tags.json), so keyword
/// recordings - and which airings they've already scheduled - survive restarts and updates.
/// </summary>
public class KeywordRulesStore : IKeywordRulesStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _filePath;
    private readonly Lock _lock = new();
    private List<KeywordRule> _rules;

    public KeywordRulesStore(IHostEnvironment environment)
    {
        _filePath = Path.Combine(environment.ContentRootPath, "keyword-recordings.json");
        _rules = Load(_filePath);
    }

    public IReadOnlyList<KeywordRule> GetAll()
    {
        lock (_lock)
        {
            return _rules.ToList();
        }
    }

    public KeywordRule? Get(string id)
    {
        lock (_lock)
        {
            return _rules.FirstOrDefault(r => r.Id == id);
        }
    }

    public KeywordRule Add(string name, KeywordCriteria criteria)
    {
        var rule = new KeywordRule(Guid.NewGuid().ToString("N"), name, criteria, DateTimeOffset.UtcNow, []);
        lock (_lock)
        {
            _rules = [.. _rules, rule];
            Save();
        }

        return rule;
    }

    public bool Remove(string id)
    {
        lock (_lock)
        {
            var remaining = _rules.Where(r => r.Id != id).ToList();
            if (remaining.Count == _rules.Count)
            {
                return false;
            }

            _rules = remaining;
            Save();
            return true;
        }
    }

    public void RecordResults(string id, IReadOnlyCollection<HandledAiring> handled)
    {
        var forgetBefore = DateTime.UtcNow.AddDays(-1);
        lock (_lock)
        {
            var index = _rules.FindIndex(r => r.Id == id);
            if (index < 0)
            {
                // Deleted while its matches were being scheduled.
                return;
            }

            var rule = _rules[index];
            _rules[index] = rule with
            {
                Handled = rule.Handled
                    .Concat(handled)
                    .DistinctBy(h => h.Path)
                    .Where(h => h.End > forgetBefore)
                    .ToList(),
            };
            Save();
        }
    }

    // Callers hold _lock. Written whole each time - it's a handful of rules.
    private void Save() => File.WriteAllText(_filePath, JsonSerializer.Serialize(_rules, JsonOptions));

    private static List<KeywordRule> Load(string filePath)
    {
        if (!File.Exists(filePath))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<KeywordRule>>(File.ReadAllText(filePath)) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
