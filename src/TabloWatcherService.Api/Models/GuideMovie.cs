namespace TabloWatcherService.Api.Models;

public class GuideMovie
{
    public string Identifier { get; set; } = string.Empty;
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public MovieDetails Movie { get; set; } = new();
    public ShowCounts ShowCounts { get; set; } = new();
    public KeepRule Keep { get; set; } = new();
    public string? RecordingsPath { get; set; }
    // Set on the /recordings/... copy of this object: the guide object it was recorded from.
    public string? GuidePath { get; set; }
}

public class MovieDetails
{
    public string Title { get; set; } = string.Empty;
    public string Plot { get; set; } = string.Empty;
    public int OriginalRuntime { get; set; }
    public int ReleaseYear { get; set; }
    public string FilmRating { get; set; } = string.Empty;
    public int? QualityRating { get; set; }
    public string[] Cast { get; set; } = [];
    public string[] Directors { get; set; } = [];
    public object[] Awards { get; set; } = [];
    public MovieImage? BackgroundImage { get; set; }
    public MovieImage? CoverImage { get; set; }
    public MovieImage? ThumbnailImage { get; set; }
    public string[] Genres { get; set; } = [];
}

public class MovieImage
{
    public int ImageId { get; set; }
    public bool HasTitle { get; set; }
}

public class ShowCounts
{
    public int AiringCount { get; set; }
    public int ConflictedCount { get; set; }
    public int ScheduledCount { get; set; }
}

public class KeepRule
{
    public string Rule { get; set; } = string.Empty;
    public int? Count { get; set; }
}
