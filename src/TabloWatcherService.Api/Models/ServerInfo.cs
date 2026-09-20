namespace TabloWatcherService.Api.Models;

public class ServerInfo
{
    public string ServerId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Timezone { get; set; } = string.Empty;
    public string Deprecated { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string LocalAddress { get; set; } = string.Empty;
    public bool SetupCompleted { get; set; }
    public int BuildNumber { get; set; }
    public ServerModel Model { get; set; } = new();
    public string Availability { get; set; } = string.Empty;
    public string CacheKey { get; set; } = string.Empty;
    public string Product { get; set; } = string.Empty;
}

public class ServerModel
{
    public bool Wifi { get; set; }
    public int Tuners { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
