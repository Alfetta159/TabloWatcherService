using System.Text.Json.Serialization;

namespace TabloWatcherService.Api.Models;

// A manual recording: a channel and a time slot, once or on a weekly repeat, rather than a
// series or movie from the guide (GET /guide/programs/{id}). Created with POST /guide/programs
// and cancelled with DELETE /guide/programs/{id}; each slot it covers is a guide airing at
// /guide/programs/airings/{id}, and what it records lands under RecordingsPath.
public class ManualProgram
{
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public ManualProgramConfig Config { get; set; } = new();
    public string? RecordingsPath { get; set; }
}

public class ManualProgramConfig
{
    public string Title { get; set; } = string.Empty;
    public string ChannelPath { get; set; } = string.Empty;
    // Seconds.
    public int Duration { get; set; }
    // "once" or "recurring" - which of Once/Recurring is set.
    public string Kind { get; set; } = string.Empty;
    // Left out of a create request when unset, rather than sent as null.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ManualProgramOnce? Once { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ManualProgramRecurring? Recurring { get; set; }
}

public class ManualProgramOnce
{
    public int Year { get; set; }
    public int Month { get; set; }
    public int Day { get; set; }
    public int Hour { get; set; }
    public int Minute { get; set; }
    // IANA, e.g. "America/Los_Angeles"; the time above is local to it.
    public string Timezone { get; set; } = string.Empty;
}

public class ManualProgramRecurring
{
    // Lowercase English day names, e.g. "monday".
    public string[] Days { get; set; } = [];
    public int Hour { get; set; }
    public int Minute { get; set; }
    public string Timezone { get; set; } = string.Empty;
}
