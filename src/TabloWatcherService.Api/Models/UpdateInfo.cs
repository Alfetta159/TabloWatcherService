namespace TabloWatcherService.Api.Models;

public class UpdateInfo
{
    public object? Details { get; set; }
    public object? AvailableUpdate { get; set; }
    public DateTime LastChecked { get; set; }
    public DateTime? LastUpdate { get; set; }
    public string[] Sequence { get; set; } = [];
    public string? CurrentStep { get; set; }
    public string State { get; set; } = string.Empty;
    public object? Error { get; set; }
}
