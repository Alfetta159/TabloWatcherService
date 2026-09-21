# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A system for watching and configuring recordings for legacy Tablo DVR devices. A single
ASP.NET Core (.NET 10) host serves both the REST API (under `/api`) and a React SPA on one
port — one process to run, one port to open, no reverse proxy or CORS needed in production.

- `src/TabloWatcherService.Api` — ASP.NET Core Web API + static file host (backend + proxy to Tablo devices)
- `src/tablowatcher-web` — React 19 SPA (Vite, TypeScript, Tailwind CSS v4, shadcn/ui)

No test project exists in this repo yet.

## Commands

### Backend (`src/TabloWatcherService.Api`)

```bash
dotnet build src/TabloWatcherService.Api          # build
dotnet run --project src/TabloWatcherService.Api  # run API only, on http://localhost:5080
```

### Frontend (`src/tablowatcher-web`)

```bash
npm install   # once
npm run dev       # Vite dev server on http://localhost:5173, proxies /api/* to :5080
npm run build      # tsc -b && vite build; output goes straight into ../TabloWatcherService.Api/wwwroot
npm run lint       # oxlint
npm run preview
```

Add new UI components from shadcn/ui with `npx shadcn@latest add <component>` (run from
`src/tablowatcher-web`; style/aliases configured in `components.json`).

### Local development (both together)

Preferred: open the repo in VS Code and run the **Launch API + SPA (SpaProxy)** config
(F5). This builds and starts the API, which auto-launches `npm run dev` if it isn't already
running (via the `Microsoft.AspNetCore.SpaProxy` package + `ASPNETCORE_HOSTINGSTARTUPASSEMBLIES`
in `launchSettings.json`), and opens `http://localhost:5080`. If `npm run dev` is already
running in another terminal, SpaProxy detects and reuses it instead of starting a second one.

Equivalent from the CLI: run `dotnet run` in `src/TabloWatcherService.Api` and separately
`npm run dev` in `src/tablowatcher-web`, then browse to whichever port suits (5080 goes
through SpaProxy to the Vite server; 5173 hits Vite directly).

### Production build

```bash
dotnet publish src/TabloWatcherService.Api -c Release -o ./publish
```

The `BuildSpa` MSBuild target in `TabloWatcherService.Api.csproj` runs `npm ci` + `npm run
build` for the SPA and injects the built files into the publish output (hooked on
`AfterTargets="ComputeFilesToPublish"`, not before, because the wwwroot glob that normally
picks up static content is evaluated before an earlier hook would run). A plain `dotnet
build`/`dotnet run` does **not** trigger this — during backend-only work the SPA is stale
until you publish or build it yourself. Result is a single self-contained deployable:
`dotnet TabloWatcherService.Api.dll` serves both API and SPA on one port.

## Architecture

### Two upstream Tablo APIs, one local proxy pattern

The API talks to two distinct Tablo endpoints, both wrapped as Refit interfaces
(`src/TabloWatcherService.Api/Services/Tablo`), both registered as compile-time-generated
clients (`AddRefitGeneratedClient` / `RestService.ForGenerated`, not the reflection-based
`RestService.For`) so there's no runtime codegen:

- **`IAssociationServerClient`** — Tablo's cloud association server
  (`https://api.tablotv.com`, configured via `Tablo:AssociationServerBaseUrl`), fixed base
  address set once at startup. Used to discover which Tablo devices exist and their local
  IP/port (`ServersController` → `GET /assocserver/getipinfo/`).
- **`ITabloDeviceClient`** — a Tablo device's *own* local HTTP API. Unlike the association
  server, a device's address isn't known at startup — it varies per device and is
  discovered at runtime by the frontend from the association server response. So this
  client has no fixed base address; `ITabloDeviceClientFactory`/`TabloDeviceClientFactory`
  builds one per request from `ip`/`port` query parameters the caller supplies.

Both clients share one `RefitSettings` configured for the Tablo association server's
snake_case JSON (`JsonNamingPolicy.SnakeCaseLower`) plus a custom `TabloDateTimeConverter`
(the association server emits timestamps like `"2026-09-20 03:07:25.664585+00:00"` — a
space instead of `T` — which `System.Text.Json`'s default converter rejects).

### Controller pattern: `TabloDeviceControllerBase<TResponse>`

Most controllers under `Controllers/` proxy a single no-argument GET to a Tablo device's
local API and are just a one-line override of `TabloDeviceControllerBase<TResponse>`:

```csharp
public class HardDrivesController(ITabloDeviceClientFactory clientFactory)
    : TabloDeviceControllerBase<HardDrive[]>(clientFactory)
{
    protected override Task<ApiResponse<HardDrive[]>> GetResponseAsync(ITabloDeviceClient client) =>
        client.GetHardDrivesAsync();
}
```

The base class handles the `ip`/`port` query parameters, building the per-request client,
and translating a non-2xx/failed Refit response via `RefitResponseExtensions.ToErrorResult()`
(a `502` when the request never got an HTTP response at all — DNS failure, connection
refused, timeout — vs. passing through whatever status code the device did return).

Controllers that need more than one no-arg call (e.g. a resource fetched by ID, like
`GuideChannelsController`'s `GetById` or `SeriesSeasonsController`) still extend the base
for the plain list endpoint but add extra `[HttpGet]` actions that build their own client
via `ClientFactory.Create(ip, port)` directly, following the same error-handling pattern by
hand. When adding a new proxied endpoint, follow whichever of these two shapes fits.

### Frontend/backend integration

- Dev: Vite (`vite.config.ts`) proxies `/api/*` to `http://localhost:5080` — no CORS needed
  either way, whether you go through SpaProxy or hit Vite directly.
- Build: Vite's `build.outDir` points directly at
  `../TabloWatcherService.Api/wwwroot`, and `app.MapFallbackToFile("index.html")` in
  `Program.cs` serves the SPA for any non-API route.
- Path alias `@/*` → `src/tablowatcher-web/src/*`, defined in both `tsconfig.app.json` and
  `vite.config.ts` (required by shadcn/ui-generated components).

### Networking / deployment notes

- The API binds `0.0.0.0:5080` by default (`Kestrel:Endpoints:Http:Url` in
  `appsettings.json`), i.e. reachable on the LAN, not just localhost — tighten
  `AllowedHosts`/firewall rules if that's unwanted exposure.
- `Program.cs` calls both `UseSystemd()` and `UseWindowsService()` unconditionally; each is
  a no-op unless actually hosted that way (systemd unit in `deploy/tablowatcherservice.service`,
  or a Windows Service), so the same build runs standalone (`dotnet run`), as a Linux
  service, or as a Windows Service without changes.
