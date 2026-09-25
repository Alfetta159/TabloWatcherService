using System.Text.Json;

namespace TabloWatcherService.Api.Services;

/// <summary>
/// Genre tags blocked for everyone (TV Shows, Movies and Sports all filter them out
/// server-side) - a global setting, not a per-user one, since this app has no concept of
/// separate users.
/// </summary>
public interface IBlockedTagsStore
{
    IReadOnlySet<string> Get();

    void Set(IEnumerable<string> tags);
}

/// <summary>
/// Persisted to a small JSON file next to the app so the block list survives restarts -
/// there's no database in this app, and one small shared setting doesn't need one.
/// </summary>
public class BlockedTagsStore : IBlockedTagsStore
{
    private readonly string _filePath;
    private readonly Lock _lock = new();
    private IReadOnlySet<string> _tags;

    public BlockedTagsStore(IHostEnvironment environment)
    {
        _filePath = Path.Combine(environment.ContentRootPath, "blocked-tags.json");
        _tags = Load(_filePath);
    }

    public IReadOnlySet<string> Get()
    {
        lock (_lock)
        {
            return _tags;
        }
    }

    public void Set(IEnumerable<string> tags)
    {
        var normalized = new HashSet<string>(tags.Where(t => !string.IsNullOrWhiteSpace(t)), StringComparer.OrdinalIgnoreCase);

        lock (_lock)
        {
            _tags = normalized;
            File.WriteAllText(_filePath, JsonSerializer.Serialize(normalized));
        }
    }

    private static IReadOnlySet<string> Load(string filePath)
    {
        if (!File.Exists(filePath))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            var tags = JsonSerializer.Deserialize<string[]>(File.ReadAllText(filePath));
            return new HashSet<string>(tags ?? [], StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
