namespace TabloWatcherService.Api.Models;

public class SubscriptionInfo
{
    public SubscriptionServices Services { get; set; } = new();
    public string State { get; set; } = string.Empty;
    public object? Trial { get; set; }
    public Registration Registration { get; set; } = new();
    public Subscription[] Subscriptions { get; set; } = [];
}

public class SubscriptionServices
{
    public GuideDataService GuideData { get; set; } = new();
    public string Deprecated { get; set; } = string.Empty;
}

public class GuideDataService
{
    public bool Selected { get; set; }
    public bool Active { get; set; }
}

public class Registration
{
    public string Url { get; set; } = string.Empty;
    public string Identifier { get; set; } = string.Empty;
}

public class Subscription
{
    public string Kind { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Deprecated { get; set; } = string.Empty;
    public DateTime Expires { get; set; }
    public string RegistrationUrl { get; set; } = string.Empty;
    public string RegistrationIdentifier { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public object[] Actions { get; set; } = [];
    public object[] Warnings { get; set; } = [];
}
