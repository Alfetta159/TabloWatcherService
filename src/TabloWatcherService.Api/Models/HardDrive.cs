namespace TabloWatcherService.Api.Models;

// A device with no drive plugged in still reports one slot, with every field but Connected
// null (seen on a Tablo DUAL LITE) - hence the nullables.
public class HardDrive
{
    public object? Error { get; set; }
    public bool Connected { get; set; }
    public string? FormatState { get; set; }
    public string? Name { get; set; }
    public string? BusyState { get; set; }
    public string? Kind { get; set; }
    public long? Size { get; set; }
    public long? SizeMib { get; set; }
    public long? Usage { get; set; }
    public long? UsageMib { get; set; }
    public long? Free { get; set; }
    public long? FreeMib { get; set; }
    public long? Limit { get; set; }
    public long? LimitMib { get; set; }
}
