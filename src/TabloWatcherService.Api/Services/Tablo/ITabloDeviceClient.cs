using Refit;
using TabloWatcherService.Api.Models;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// Talks to a Tablo device's own local HTTP API (host:port from
/// <see cref="IAssociationServerClient"/>'s recorder list), as opposed to Tablo's
/// public cloud API.
/// </summary>
public interface ITabloDeviceClient
{
    [Get("/account/subscription")]
    Task<ApiResponse<SubscriptionInfo>> GetSubscriptionAsync();
}
