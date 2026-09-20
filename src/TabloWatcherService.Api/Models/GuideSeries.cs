namespace TabloWatcherService.Api.Models;

public class GuideSeries
{
    public string Identifier { get; set; } = string.Empty;
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public SeriesSchedule Schedule { get; set; } = new();
    public string ScheduleRule { get; set; } = string.Empty;
    public SeriesDetails Series { get; set; } = new();
    public ShowCounts ShowCounts { get; set; } = new();
    public KeepRule Keep { get; set; } = new();
    public string? RecordingsPath { get; set; }
}

public class SeriesSchedule
{
    public string Rule { get; set; } = string.Empty;
    public string? ChannelPath { get; set; }
    public ScheduleOffsets Offsets { get; set; } = new();
}

public class ScheduleOffsets
{
    public int Start { get; set; }
    public int End { get; set; }
    public string Source { get; set; } = string.Empty;
}

public class SeriesDetails
{
    public string Title { get; set; } = string.Empty;
    public string[] Genres { get; set; } = [];
    public string Description { get; set; } = string.Empty;
    public DateOnly OrigAirDate { get; set; }
    public int EpisodeRuntime { get; set; }
    public string SeriesRating { get; set; } = string.Empty;
    public string[] Cast { get; set; } = [];
    public object[] Awards { get; set; } = [];
    public MovieImage BackgroundImage { get; set; } = new();
    public MovieImage CoverImage { get; set; } = new();
    public MovieImage ThumbnailImage { get; set; } = new();
}
