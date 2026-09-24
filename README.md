# TabloWatcherService

A web app for watching live TV and browsing the guide on **legacy Tablo DVR devices**,
served from your own machine on your home network.

## Features

- **Guide grid:** a six-hour channels-by-time grid, with ‹ / › to page through time and
  **Now** to jump back. Channels appear right away; programs fill in once the server has
  finished loading listings from the device.
- **Live TV:** click a channel's number/call sign to tune it and play it in the browser.
  Clicking a program only previews it, without interrupting what's playing.
- **Preview pane:** title, episode, description, background art and poster for the
  selected program. The split between the preview pane and the guide can be dragged.
- **Tuner labels:** each channel that's on one of the device's tuners shows "Tuner N",
  whether this app, another Tablo client or a recording is using it.
- The player keeps your volume and mute setting across channel changes and reloads.

## Requirements

- A legacy Tablo DVR on the same network as the machine running this app.
- To run it: the [ASP.NET Core 10 runtime](https://dotnet.microsoft.com/download/dotnet/10.0).
- To build it: the .NET 10 SDK and Node.js 20.19+ or 22.12+ (required by Vite).
- A current browser (Chrome, Edge, Firefox or Safari). Live video streams straight from
  the Tablo to the browser, so the browser must also be able to reach the Tablo on the
  network.

## Architecture

A single ASP.NET Core (.NET 10) host serves both the REST API (under `/api`) and a
React + Vite + TypeScript single-page app, on one port. In production this is one
process to run and one port to open — no reverse proxy required. The SPA calls the
API same-origin, so no CORS configuration is needed outside of local development.

- [src/TabloWatcherService.Api](src/TabloWatcherService.Api) — ASP.NET Core Web API + static file host
- [src/tablowatcher-web](src/tablowatcher-web) — React SPA (Vite, TypeScript, Tailwind CSS, shadcn/ui)
- [deploy](deploy) — systemd unit and install script for running as a Linux service

The API talks to two Tablo endpoints:

- **Tablo's cloud association server** (`https://api.tablotv.com`), to discover which
  Tablo devices are on your account and their local IP addresses.
- **The Tablo device's own local API** (port 8885), for channels, guide data, images,
  tuners and starting live streams.

A background service rebuilds the guide from the device every 15 minutes (see
[Configuration](#configuration)). The first build after startup takes a few minutes, since
the device only answers one request at a time; the guide shows "Loading listings…" until
then.

New UI components come from shadcn/ui: `npx shadcn@latest add <component>` from
`src/tablowatcher-web` (see [components.json](src/tablowatcher-web/components.json)
for the configured style/aliases).

The API binds to `0.0.0.0:5080` by default (see `Kestrel:Endpoints:Http:Url` in
[appsettings.json](src/TabloWatcherService.Api/appsettings.json)), so it's reachable
from other machines on the LAN, not just `localhost`. There is no login, so restrict
`AllowedHosts` / firewall rules if that's more exposure than you want, and don't forward
the port from your router.

## Local development

### Option 1: one command (SpaProxy)

VS Code: run `npm install` once in `src/tablowatcher-web`, then use the
**Launch API + SPA (SpaProxy)** configuration in [.vscode/launch.json](.vscode/launch.json)
(Run and Debug panel, or F5). It builds and starts the API, which in turn
launches `npm run dev` for you if it isn't already running, and opens
`http://localhost:5080` in your browser.

From the command line it's the same underlying behavior — just run the API:

```bash
cd src/tablowatcher-web && npm install   # once
cd ../TabloWatcherService.Api
dotnet run
```

Browsing to `http://localhost:5080` will redirect you to the live Vite dev
server (with hot-reload) — this comes from the `Microsoft.AspNetCore.SpaProxy`
package referenced in [TabloWatcherService.Api.csproj](src/TabloWatcherService.Api/TabloWatcherService.Api.csproj)
and activated via `ASPNETCORE_HOSTINGSTARTUPASSEMBLIES` in
[launchSettings.json](src/TabloWatcherService.Api/Properties/launchSettings.json).
If you already have `npm run dev` running in another terminal, SpaProxy detects
it and reuses it instead of starting a second instance.

### Option 2: run both yourself

Equivalent, just more explicit about what's running where — Vite proxies
`/api/*` requests to the API (see [vite.config.ts](src/tablowatcher-web/vite.config.ts)),
so you get hot-reload on the frontend without CORS either way.

```bash
# terminal 1 - API on http://localhost:5080
cd src/TabloWatcherService.Api
dotnet run

# terminal 2 - SPA dev server on http://localhost:5173
cd src/tablowatcher-web
npm install
npm run dev
```

Browse to `http://localhost:5173` directly during development.

### Other frontend commands

Run from `src/tablowatcher-web`:

```bash
npm run build   # type-check and build into the API's wwwroot
npm run lint    # oxlint
```

## Configuration

Settings live in [appsettings.json](src/TabloWatcherService.Api/appsettings.json). Any of
them can be overridden with an environment variable, using `__` in place of `:` (for
example `Tablo__AiringsRefreshIntervalMinutes=30`). For the Linux service, add these as
`Environment=` lines in the systemd unit.

| Setting | Default | What it does |
| --- | --- | --- |
| `Kestrel:Endpoints:Http:Url` | `http://0.0.0.0:5080` | Address and port the app listens on |
| `Tablo:AssociationServerBaseUrl` | `https://api.tablotv.com` | Tablo's cloud association server |
| `Tablo:AiringsRefreshIntervalMinutes` | `15` | How often the guide is rebuilt from the device |
| `Logging:LogLevel:System.Net.Http.HttpClient` | `Warning` (`Trace` in Development) | How much detail to log about requests to Tablo; `Trace` logs every request |

## Building for production

```bash
dotnet publish src/TabloWatcherService.Api -c Release -o ./publish
```

Publishing automatically runs `npm ci` + `npm run build` for the SPA and drops the
built assets into `wwwroot`, so `./publish` is a single self-contained deployable:
`dotnet TabloWatcherService.Api.dll` serves both the API and the SPA on one port.
Browse to `http://<host>:5080/` to reach the SPA (or `http://<host>:5080/api/...`
for the API directly).

A plain `dotnet build` or `dotnet run` doesn't rebuild the SPA; only `publish` does (or run
`npm run build` yourself).

## Running as a service

### Linux (systemd)

The easiest way is the install script. Run it from the repo as your normal user, not with
`sudo`; it asks for your password when it needs it:

```bash
deploy/install.sh
```

It builds the app, creates a `tablowatcher` system user if needed, copies the build to
`/opt/tablowatcherservice`, installs [deploy/tablowatcherservice.service](deploy/tablowatcherservice.service),
and starts the service so it also starts at boot. Run it again whenever you want to update
the service to your latest code.

The service listens on port **8080** (browse to `http://<host>:8080/`), set by the unit
file, so it can run alongside a development session on 5080.

To do the same by hand:

1. Build with `dotnet publish` (see above) and copy the output to `/opt/tablowatcherservice`.
2. Create a dedicated user: `sudo useradd -r -s /usr/sbin/nologin tablowatcher`.
3. Copy [deploy/tablowatcherservice.service](deploy/tablowatcherservice.service) to
   `/etc/systemd/system/` (adjust `WorkingDirectory`/`ExecStart` if you used a
   different install path).
4. Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tablowatcherservice
```

Checking on it:

```bash
systemctl status tablowatcherservice
journalctl -u tablowatcherservice -f
```

The app calls `UseSystemd()` in [Program.cs](src/TabloWatcherService.Api/Program.cs),
so systemd gets proper start/stop notifications and journal-integrated logging.

To use a different port, change the `Kestrel__Endpoints__Http__Url` line in the unit file
and re-run `deploy/install.sh`.

### Windows (Windows Service)

1. Copy the publish output to the target machine, e.g. `C:\Services\TabloWatcherService`.
2. Create the service (elevated PowerShell):

```powershell
New-Service -Name "TabloWatcherService" `
  -BinaryPathName "C:\Services\TabloWatcherService\TabloWatcherService.Api.exe" `
  -DisplayName "Tablo Watcher Service" `
  -StartupType Automatic
Start-Service TabloWatcherService
```

The app calls `UseWindowsService()`, so it integrates with the Windows Service
Control Manager (start/stop, Windows Event Log) the same way `UseSystemd()` does
on Linux. `UseSystemd()`/`UseWindowsService()` are no-ops on the "wrong" OS or when
just running `dotnet run`, so the same build works everywhere.

### LAN access / firewall

Whichever OS you run it on, opening the service to the LAN means opening its port
in the OS firewall (8080 for the Linux service, 5080 by default otherwise):

```bash
# Linux (ufw example)
sudo ufw allow 8080/tcp
```

```powershell
# Windows
New-NetFirewallRule -DisplayName "TabloWatcherService" -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow
```

## API

The main endpoints the web app uses. Endpoints that take `ip` (and optionally `port`,
default `8885`) query parameters talk to that Tablo device; the rest use the first device
the association server reports.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/servers` | Tablo devices on your account, with their local IPs |
| `GET /api/guide/grid?from=&to=` | Guide grid: channels with their airings in a time window |
| `GET /api/guide-channels?ip=` / `POST` | Channel paths, then channel details for a list of paths |
| `POST /api/watch/{channelId}` | Tune a channel; returns the HLS `playlistUrl` to play |
| `GET /api/watch/{channelId}/tuner` | Which tuner a just-tuned channel landed on |
| `GET /api/watch/tuners` | The channel on each busy tuner |
| `GET /api/images/{imageId}` | An image from the device |
| `GET /api/images/background` / `thumbnail` `?seriesPath=` or `?moviePath=` | Redirects to a series' or movie's background or poster image |

Series, season and movie details are under `/api/guide-series`, `/api/guide-series-seasons`
and `/api/guide-movies`. Several other device endpoints (tuners, hard drives, storage and
so on) exist in [Controllers](src/TabloWatcherService.Api/Controllers) but are currently
commented out.

## Troubleshooting

- **The guide stays on "Loading listings…"**: the first load after a start takes a few
  minutes. If it never finishes, check the logs (`journalctl -u tablowatcherservice` for the
  service). Tablo's association server sometimes rate-limits requests (HTTP 429), especially
  after many restarts; the app retries every minute until it gets through.
- **A channel won't play**: the browser plays the stream directly from the Tablo, so the
  device's IP must be reachable from the machine running the browser, not just from the
  server. All tuners being busy can also make tuning slow or fail.
- **The service won't start**: another process may already be using its port (8080 for the
  Linux service). Stop it or change the service's port (see above).

## Tablo Legacy API

See [Postman Collection](https://www.postman.com/flight-cosmologist-72572352-s-team/workspace/my-workspace/collection/21049791-6031e448-291e-4f4b-9099-876779d245bf?action=share&creator=33121888)
