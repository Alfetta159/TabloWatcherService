using System.Reflection;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Which build this server is - the csproj's version (set from the release tag when
/// packaged) and the commit it was built from. The SPA shows it, and warns when it was built
/// for a different version than the server it's talking to (e.g. a service that kept running
/// an old binary after an upgrade replaced its files).
/// </summary>
[ApiController]
[Route("api/version")]
public class VersionController : LoggedControllerBase
{
    // e.g. "0.1.0-preview9+5ce7050..." - the SDK appends the commit when built from a git checkout.
    private static readonly string InformationalVersion =
        typeof(VersionController).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "unknown";

    [HttpGet]
    public IActionResult Get()
    {
        var plus = InformationalVersion.IndexOf('+');
        return Ok(new
        {
            version = plus < 0 ? InformationalVersion : InformationalVersion[..plus],
            commit = plus < 0 ? null : InformationalVersion[(plus + 1)..],
        });
    }
}
