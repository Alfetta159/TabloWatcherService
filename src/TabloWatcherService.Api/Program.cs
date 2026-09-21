using System.Text.Json;
using Refit;
using TabloWatcherService.Api.Services.Tablo;

var builder = WebApplication.CreateBuilder(args);

// Lets the app run as a Linux systemd service or a Windows Service when hosted that way;
// it's a no-op when launched normally (e.g. `dotnet run`, debugger, Docker).
builder.Host.UseSystemd();
builder.Host.UseWindowsService();

builder.Services.AddOpenApi();
builder.Services.AddControllers();

// Refit 16 generates the client implementation at compile time by default (no runtime
// reflection/codegen); AddRefitGeneratedClient wires up that generated implementation.
// The association server's JSON fields are snake_case (e.g. "public_ip").
var tabloJsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
tabloJsonOptions.Converters.Add(new TabloDateTimeConverter());
var tabloRefitSettings = new RefitSettings(new SystemTextJsonContentSerializer(tabloJsonOptions));

builder.Services
    .AddRefitGeneratedClient<IAssociationServerClient>(tabloRefitSettings)
    .ConfigureHttpClient(client =>
    {
        client.BaseAddress = new Uri(builder.Configuration["Tablo:AssociationServerBaseUrl"]!);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("TabloWatcherService/1.0");
    });

// Unlike the association server, a Tablo device's local API has no fixed address - its
// private_ip and http port (from GET /api/servers) vary per device, discovered at runtime
// by the front end. So ITabloDeviceClient can't be configured with one base address at
// startup; ITabloDeviceClientFactory builds one per request instead, from "ip"/"port" query
// parameters the caller supplies (see TabloDeviceControllerBase).
// The device's local API rejects requests without a User-Agent header (403 "Request
// forbidden by administrative rules"), which HttpClient doesn't send by default.
builder.Services.AddHttpClient(nameof(ITabloDeviceClient), client =>
    client.DefaultRequestHeaders.UserAgent.ParseAdd("TabloWatcherService/1.0"));
builder.Services.AddSingleton<ITabloDeviceClientFactory>(serviceProvider =>
    new TabloDeviceClientFactory(serviceProvider.GetRequiredService<IHttpClientFactory>(), tabloRefitSettings));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapControllers();

var api = app.MapGroup("/api");

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

api.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

// Serves the built React SPA (wwwroot, produced by `npm run build` in src/tablowatcher-web).
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
