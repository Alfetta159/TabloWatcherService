namespace TabloWatcherService.Api.Controllers;

public static class RefitResponseExtensions
{
    public static IActionResult ToErrorResult(this IApiResponse response) =>
        // StatusCode is null when the request never got an HTTP response at all
        // (DNS failure, connection refused, timeout), not just on a non-2xx status.
        new StatusCodeResult(response.StatusCode is { } statusCode ? (int)statusCode : StatusCodes.Status502BadGateway);
}
