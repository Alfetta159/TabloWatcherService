namespace TabloWatcherService.Api.Models;

public class WatchInfo
{
    public string Token { get; set; } = string.Empty;
    public DateTime Expires { get; set; }
    public int Keepalive { get; set; }
    public string PlaylistUrl { get; set; } = string.Empty;
    public bool CanRecord { get; set; }
}
