namespace TabloWatcherService.Api.Models;

public class GuideStatus
{
    public bool GuideSeeded { get; set; }
    public DateTime LastUpdate { get; set; }
    public DateTime Limit { get; set; }
    public object? DownloadProgress { get; set; }
}
