namespace TabloWatcherService.Api.Models;

// A recording on the Tablo (GET /recordings/airings, then /batch) - a recorded series
// episode, movie airing, sports event or program airing. Shaped like a guide Airing, plus
// what the device knows about the recorded video and whether it's been watched. Which of
// the parent paths is set identifies the kind; the parent (GuideSeries, GuideMovie,
// GuideSport or GuideProgram, at a /recordings/... path) has the artwork and descriptions.
public class RecordedAiring
{
    public string Path { get; set; } = string.Empty;
    public int ObjectId { get; set; }
    public string? SeriesPath { get; set; }
    public string? SeasonPath { get; set; }
    public string? MoviePath { get; set; }
    public string? SportPath { get; set; }
    public string? ProgramPath { get; set; }
    // A frame grabbed from the recording itself.
    public MovieImage? SnapshotImage { get; set; }
    public AiringDetails AiringDetails { get; set; } = new();
    public RecordedVideo? VideoDetails { get; set; }
    public RecordingUserInfo? UserInfo { get; set; }
    public EpisodeInfo? Episode { get; set; }
    public MovieAiringInfo? MovieAiring { get; set; }
    public SportEventInfo? Event { get; set; }
    public string[] Qualifiers { get; set; } = [];
}

public class RecordedVideo
{
    // Seen: "finished", "recording"; presumably also "failed" and a not-yet-started state.
    public string State { get; set; } = string.Empty;
    // Bytes - can exceed 2 GB, hence long.
    public long Size { get; set; }
    // Seconds actually recorded (0 while still recording).
    public int Duration { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
}

public class RecordingUserInfo
{
    // Seconds into the recording where playback left off.
    public int Position { get; set; }
    public bool Watched { get; set; }
    // Kept from being deleted automatically by the series' keep rule.
    public bool Protected { get; set; }
}
