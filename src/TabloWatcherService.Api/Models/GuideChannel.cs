namespace TabloWatcherService.Api.Models;

public class GuideChannel
{
    public int ObjectId { get; set; }
    public string Path { get; set; } = string.Empty;
    public ChannelDetails Channel { get; set; } = new();
}

public class ChannelDetails
{
    public string CallSign { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CallSignSrc { get; set; } = string.Empty;
    public int Major { get; set; }
    public int Minor { get; set; }
    public string Network { get; set; } = string.Empty;
    public string[] Flags { get; set; } = [];
    public string Resolution { get; set; } = string.Empty;
    public bool Favourite { get; set; }
    public string TmsStationId { get; set; } = string.Empty;
    public string TmsAffiliateId { get; set; } = string.Empty;
    public string ChannelIdentifier { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public ChannelLogo[] Logos { get; set; } = [];
}

/// <summary>
/// A network logo hosted on Tablo's CDN. Devices seen so far send one of each kind:
/// "darkLarge" (black, for light backgrounds), "lightLarge" (white, for dark backgrounds)
/// and "originalLarge" (full colour). Most channels send none.
/// </summary>
public class ChannelLogo
{
    public string Kind { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
}
