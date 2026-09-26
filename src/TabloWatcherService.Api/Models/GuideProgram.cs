namespace TabloWatcherService.Api.Models;

// A "program": something with no series or movie data behind it, like a local newscast
// (e.g. "Good Day Sacramento"). The device only knows its title - no artwork or description.
public class GuideProgram
{
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public ProgramDetails Program { get; set; } = new();
}

public class ProgramDetails
{
    public string Title { get; set; } = string.Empty;
}
