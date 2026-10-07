using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// Common controller base that logs unsuccessful results for every action.
/// </summary>
public abstract class LoggedControllerBase : Controller
{
    private ILoggerFactory LoggerFactory => HttpContext.RequestServices.GetRequiredService<ILoggerFactory>();

    public override void OnActionExecuted(ActionExecutedContext context)
    {
        if (context.Exception is not null)
        {
            LoggerFactory.CreateLogger(GetType()).LogError(
                context.Exception,
                "Controller action {Action} on {Path} threw an exception.",
                context.ActionDescriptor.DisplayName,
                context.HttpContext.Request.Path);
        }
        else if (TryGetStatusCode(context.Result, out var statusCode) && statusCode is < 200 or >= 300)
        {
            LoggerFactory.CreateLogger(GetType()).LogError(
                "Controller action {Action} on {Path} returned {StatusCode}.",
                context.ActionDescriptor.DisplayName,
                context.HttpContext.Request.Path,
                statusCode);
        }

        base.OnActionExecuted(context);
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
