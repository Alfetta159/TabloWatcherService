namespace TabloWatcherService.Api.Models;

public class Tuner
{
    public bool InUse { get; set; }
    public string? Channel { get; set; }
    public string? Recording { get; set; }
    public string? ChannelIdentifier { get; set; }
}
