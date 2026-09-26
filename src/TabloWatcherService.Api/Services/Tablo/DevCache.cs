using System.Text.Json;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Best-effort JSON persistence of a store's last refresh, so restarting the debugger during
/// development doesn't mean waiting on the Tablo device's slow, sequentially-batched guide/
/// recordings fetch every time. Only ever used when <see cref="IHostEnvironment.IsDevelopment"/>
/// is true (see AiringsStore/RecordingsStore) - never written in production.
/// </summary>
internal static class DevCache
{
    public static T? Load<T>(string filePath)
        where T : class
    {
        if (!File.Exists(filePath))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(File.ReadAllText(filePath));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static void Save<T>(string filePath, T value)
    {
        try
        {
            File.WriteAllText(filePath, JsonSerializer.Serialize(value));
        }
        catch (IOException)
        {
            // Best-effort - a dev convenience, not core functionality.
        }
    }
}
