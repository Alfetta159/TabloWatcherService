namespace TabloWatcherService.Api.Models;

public class HardDrive
{
    public object? Error { get; set; }
    public bool Connected { get; set; }
    public string FormatState { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string BusyState { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public long Size { get; set; }
    public long SizeMib { get; set; }
    public long Usage { get; set; }
    public long UsageMib { get; set; }
    public long Free { get; set; }
    public long FreeMib { get; set; }
    public long Limit { get; set; }
    public long LimitMib { get; set; }
}
