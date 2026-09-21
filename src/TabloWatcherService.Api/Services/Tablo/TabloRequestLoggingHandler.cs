namespace TabloWatcherService.Api.Services.Tablo;

// Refit builds a plain HttpRequestMessage and hands it to HttpClient - this handler sits in
// that pipeline so you can see exactly what gets sent/received, headers and body included.
public class TabloRequestLoggingHandler(ILogger<TabloRequestLoggingHandler> logger) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var requestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        logger.LogInformation("Tablo request: {Method} {Uri}\n{Body}", request.Method, request.RequestUri, requestBody);

        var response = await base.SendAsync(request, cancellationToken);

        var responseBody = response.Content is null ? null : await response.Content.ReadAsStringAsync(cancellationToken);
        logger.LogInformation("Tablo response: {StatusCode}\n{Body}", (int)response.StatusCode, responseBody);

        return response;
    }
}
