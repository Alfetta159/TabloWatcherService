using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace TabloWatcherService.Api.Controllers;

public static class RefitResponseExtensions
{
    public static IActionResult ToErrorResult(this IApiResponse response) =>
        // StatusCode is null when the request never got an HTTP response at all
        // (DNS failure, connection refused, timeout), not just on a non-2xx status. A 2xx
        // still lands here when the body couldn't be deserialized (or was missing) - passing
        // that status through would tell the caller everything worked, so it's a 502 too.
        response.StatusCode is { } statusCode && !response.IsSuccessStatusCode
            ? new StatusCodeResult((int)statusCode)
            : new BadGatewayResult(response.Error);

    /// <summary>
    /// A 502 that logs why - the upstream error is otherwise lost, and for a field the
    /// device sends in an unexpected shape the exception message is the only clue. Not a
    /// <see cref="StatusCodeResult"/>: [ApiController]'s client-error filter would swap that
    /// for its own ProblemDetails result before this ever ran, so it writes the same
    /// ProblemDetails body itself.
    /// </summary>
    private sealed class BadGatewayResult(Exception? error) : ActionResult
    {
        public override Task ExecuteResultAsync(ActionContext context)
        {
            var services = context.HttpContext.RequestServices;
            services.GetRequiredService<ILoggerFactory>()
                .CreateLogger(typeof(RefitResponseExtensions))
                .LogWarning(error, "Upstream Tablo request for {Path} failed", context.HttpContext.Request.Path);

            var problem = services.GetRequiredService<ProblemDetailsFactory>()
                .CreateProblemDetails(context.HttpContext, StatusCodes.Status502BadGateway);
            return new ObjectResult(problem) { StatusCode = problem.Status }.ExecuteResultAsync(context);
        }
    }
}
