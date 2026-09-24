using System.Text.Json.Serialization;

namespace TabloWatcherService.Api.Models;

public class RecorderInformation
{
    public bool Success { get; set; }

    [JsonPropertyName("cpes")]
    public IEnumerable<Recorder> Recorders { get; set; } = [];
}