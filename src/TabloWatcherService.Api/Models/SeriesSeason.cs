namespace TabloWatcherService.Api.Models;

public class SeriesSeason
{
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public string SeriesPath { get; set; } = string.Empty;
    public SeasonNumber Season { get; set; } = new();
    public SeasonCounts SeasonCounts { get; set; } = new();
}

public class SeasonNumber
{
    public int Number { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class SeasonCounts
{
    public int AiringCount { get; set; }
    public int ConflictedCount { get; set; }
    public int ScheduledCount { get; set; }
    public string Deprecated { get; set; } = string.Empty;
}
