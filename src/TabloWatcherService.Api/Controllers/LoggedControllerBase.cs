using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Shared controller base that logs unsuccessful responses before returning them.
/// </summary>
public abstract class LoggedControllerBase : ControllerBase
{
    protected ILogger Logger => HttpContext?.RequestServices.GetService<ILoggerFactory>()
        ?.CreateLogger(GetType()) ?? NullLogger.Instance;

    protected IActionResult LogFailure(IActionResult result, string? message = null)
    {
        var statusCode = result switch
        {
            ObjectResult objectResult => objectResult.StatusCode ?? objectResult.Value switch
            {
                ProblemDetails problem => problem.Status ?? StatusCodes.Status500InternalServerError,
                _ => StatusCodes.Status500InternalServerError,
            },
            StatusCodeResult statusCodeResult => statusCodeResult.StatusCode,
            _ => null,
        };

        if (statusCode is null || statusCode is >= 200 and < 300)
        {
            return result;
        }

        Logger.LogError(
            "Controller action {Action} on {Path} returned {StatusCode}. {Message}",
            ControllerContext.ActionDescriptor.ActionName,
            HttpContext.Request.Path,
            statusCode,
            message ?? "Unsuccessful controller operation.");

        return result;
    }
}
