namespace TabloWatcherService.Api.Models;

// A Tablo airing is one of several shapes depending on content type (plain program,
// movie, or series episode) - Episode/MovieAiring/Event are only populated for their
// matching kind, so which one is non-null identifies the airing's type.
public class Airing
{
    public string Path { get; set; } = string.Empty;
    public int ObjectId { get; set; }
    public string? ProgramPath { get; set; }
    public string? MoviePath { get; set; }
    public string? SeriesPath { get; set; }
    public string? SeasonPath { get; set; }
    public AiringDetails AiringDetails { get; set; } = new();
    public EpisodeInfo? Episode { get; set; }
    public MovieAiringInfo? MovieAiring { get; set; }
    public SportEventInfo? Event { get; set; }
}

public class AiringDetails
{
    public DateTime Datetime { get; set; }
    public int Duration { get; set; }
    public string ChannelPath { get; set; } = string.Empty;
    public GuideChannel Channel { get; set; } = new();
    public string ShowTitle { get; set; } = string.Empty;
}

public class EpisodeInfo
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Number { get; set; }
    public int SeasonNumber { get; set; }
    public string? OrigAirDate { get; set; }
    public string TmsId { get; set; } = string.Empty;
}

public class MovieAiringInfo
{
    public string TmsId { get; set; } = string.Empty;
    public int ReleaseYear { get; set; }
    public string? FilmRating { get; set; }
    public int? QualityRating { get; set; }
}

public class SportEventInfo
{
    public string Description { get; set; } = string.Empty;
}
