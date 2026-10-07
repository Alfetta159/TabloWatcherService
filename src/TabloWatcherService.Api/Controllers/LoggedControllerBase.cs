using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Logging.Abstractions;
using ProblemDetails = Microsoft.AspNetCore.Mvc.ProblemDetails;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Common controller base that logs unsuccessful results for every action.
/// </summary>
public abstract class LoggedControllerBase : Controller
{
    private ILoggerFactory LoggerFactory => HttpContext?.RequestServices.GetService<ILoggerFactory>() ?? NullLoggerFactory.Instance;

    protected ILogger Logger => LoggerFactory.CreateLogger(GetType());

    public override void OnActionExecuted(ActionExecutedContext context)
    {
        if (context.Exception is not null)
        {
            Logger.LogError(
                context.Exception,
                "Controller action {Action} on {Path} threw an exception.",
                context.ActionDescriptor.DisplayName,
                context.HttpContext.Request.Path);
        }
        else if (TryGetStatusCode(context.Result, out var statusCode) && statusCode is < 200 or >= 300)
        {
            Logger.LogError(
                "Controller action {Action} on {Path} returned {StatusCode}.",
                context.ActionDescriptor.DisplayName,
                context.HttpContext.Request.Path,
                statusCode);
        }

        base.OnActionExecuted(context);
    }

    protected IActionResult LogFailure(IActionResult result, string? message = null)
    {
        if (TryGetStatusCode(result, out var statusCode) && statusCode is < 200 or >= 300)
        {
            Logger.LogError(
                "Controller action {Action} on {Path} returned {StatusCode}. {Message}",
                ControllerContext?.ActionDescriptor?.DisplayName ?? "<unknown>",
                HttpContext?.Request.Path ?? "<unknown>",
                statusCode,
                message ?? "Unsuccessful controller operation.");
        }

        return result;
    }

    private static bool TryGetStatusCode(IActionResult? result, out int statusCode)
    {
        switch (result)
        {
            case ObjectResult objectResult:
                statusCode = objectResult.StatusCode ?? objectResult.Value switch
                {
                    ProblemDetails problem => problem.Status ?? StatusCodes.Status500InternalServerError,
                    _ => StatusCodes.Status500InternalServerError,
                };
                return true;
            case StatusCodeResult statusCodeResult:
                statusCode = statusCodeResult.StatusCode;
                return true;
            default:
                statusCode = default;
                return false;
        }
    }
}
