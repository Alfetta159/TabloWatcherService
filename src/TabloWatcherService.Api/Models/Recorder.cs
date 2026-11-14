namespace TabloWatcherService.Api.Models;

public class Recorder
{
    public string Serverid { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Board { get; set; } = string.Empty;
    public string ServerVersion { get; set; } = string.Empty;
    public string PublicIp { get; set; } = string.Empty;
    public string PrivateIp { get; set; } = string.Empty;
    public int? Http { get; set; }
    public int? Slip { get; set; }
    public DateTime LastSeen { get; set; }
    public DateTime Modified { get; set; }
    public DateTime Inserted { get; set; }
    public bool Relay { get; set; }

    public bool IsOnline(TimeSpan staleAfter)
    {
        if (LastSeen == default) return false;

        var seen = LastSeen.Kind switch
        {
            DateTimeKind.Utc => LastSeen,
            DateTimeKind.Local => LastSeen.ToUniversalTime(),
            _ => DateTime.SpecifyKind(LastSeen, DateTimeKind.Utc),
        };

        return DateTime.UtcNow - seen < staleAfter;
    }
}