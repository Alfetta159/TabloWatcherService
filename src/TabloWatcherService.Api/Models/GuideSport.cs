namespace TabloWatcherService.Api.Models;

// A sport or competition (e.g. "College Football", "2026 Presidents Cup") that sports event
// airings point back to via Airing.SportPath - where their artwork and description live.
public class GuideSport
{
    public string Identifier { get; set; } = string.Empty;
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public SportDetails Sport { get; set; } = new();
}

public class SportDetails
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string[]? Genres { get; set; }
    public MovieImage? BackgroundImage { get; set; }
    public MovieImage? CoverImage { get; set; }
    public MovieImage? ThumbnailImage { get; set; }
}
