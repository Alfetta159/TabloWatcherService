using TabloWatcherService.Api.Services;
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
// Buffered: send request bodies with a Content-Length rather than streaming them chunked -
// the device's embedded server rejects chunked bodies (e.g. POST /batch) with a 400.
var tabloRefitSettings = new RefitSettings(new SystemTextJsonContentSerializer(tabloJsonOptions))
{
    Buffered = true,
};

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
// It's also a bare HTTP/1.0 server that closes the socket after every response without
// clearly signaling it - reused pooled connections intermittently fail with "the response
// ended prematurely" (seen hammering /batch under concurrency). ConnectionClose forces a
// fresh connection per request, matching how curl (never seen to fail here) behaves.
var tabloDeviceClientBuilder = builder.Services.AddHttpClient(nameof(ITabloDeviceClient), client =>
{
    client.DefaultRequestHeaders.UserAgent.ParseAdd("TabloWatcherService/1.0");
    client.DefaultRequestHeaders.ConnectionClose = true;
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddTransient<TabloRequestLoggingHandler>();
    tabloDeviceClientBuilder.AddHttpMessageHandler<TabloRequestLoggingHandler>();
}

builder.Services.AddSingleton<ITabloDeviceClientFactory>(serviceProvider =>
    new TabloDeviceClientFactory(serviceProvider.GetRequiredService<IHttpClientFactory>(), tabloRefitSettings));

// Which Tablo devices are online: listed by the association server, confirmed by asking each
// one directly (its last_seen there isn't a reliable liveness signal). Backs /api/servers.
builder.Services.AddSingleton<ITabloDeviceDiscovery, TabloDeviceDiscovery>();

// Each Tablo has its own guide and recordings caches, channel list and keyword recordings (see
// TabloDevice), kept current in the background for every online device. A request gets the
// device the browser selected (TabloDeviceSelectionMiddleware) through the usual interfaces,
// registered per request below - so controllers just ask for IAiringsStore etc. as before.
builder.Services.AddSingleton<ITabloDeviceRegistry, TabloDeviceRegistry>();
builder.Services.AddScoped<CurrentTabloDevice>();
builder.Services.AddScoped<ICurrentTabloDeviceResolver, CurrentTabloDeviceResolver>();
builder.Services.AddScoped(sp => sp.GetRequiredService<CurrentTabloDevice>().Device.Channels);
builder.Services.AddScoped(sp => sp.GetRequiredService<CurrentTabloDevice>().Device.Airings);
builder.Services.AddScoped(sp => sp.GetRequiredService<CurrentTabloDevice>().Device.Recordings);
builder.Services.AddScoped(sp => sp.GetRequiredService<CurrentTabloDevice>().Device.KeywordRules);
builder.Services.AddScoped(sp => sp.GetRequiredService<CurrentTabloDevice>().Device.KeywordRecordings);

// Guide grid (channels x time), search and the upcoming lists; then keyword recordings.
builder.Services.AddHostedService<AiringsRefreshService>();
// The Recordings page's cache.
builder.Services.AddHostedService<RecordingsRefreshService>();

// Genre tags blocked for everyone, on every device, persisted to a small JSON file (see
// BlockedTagsStore).
builder.Services.AddSingleton<IBlockedTagsStore, BlockedTagsStore>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Before the controllers: picks the Tablo each /api request is for (see CurrentTabloDevice).
app.UseMiddleware<TabloDeviceSelectionMiddleware>();

app.MapControllers();

var api = app.MapGroup("/api");

// An /api URL no endpoint matched is a 404, not the SPA fallback below - otherwise it gets
// index.html with a 200, which the frontend then fails to parse as JSON ("Unexpected token
// '<'") instead of reporting the missing route (e.g. against a server built before it).
api.Map("/{**path}", () => Results.NotFound());

// Serves the built React SPA (wwwroot, produced by `npm run build` in src/tablowatcher-web).
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();
