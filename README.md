# TabloWatcherService
A system allowing watching and configuring recordings for legacy Tablo devices.

## Architecture

A single ASP.NET Core (.NET 10) host serves both the REST API (under `/api`) and a
React + Vite + TypeScript single-page app, on one port. In production this is one
process to run and one port to open — no reverse proxy required. The SPA calls the
API same-origin, so no CORS configuration is needed outside of local development.

- [src/TabloWatcherService.Api](src/TabloWatcherService.Api) — ASP.NET Core Web API + static file host
- [src/tablowatcher-web](src/tablowatcher-web) — React SPA (Vite, TypeScript)

The API binds to `0.0.0.0:5080` by default (see `Kestrel:Endpoints:Http:Url` in
[appsettings.json](src/TabloWatcherService.Api/appsettings.json)), so it's reachable
from other machines on the LAN, not just `localhost`. Restrict `AllowedHosts` /
firewall rules if that's more exposure than you want.

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

## Building for production

```bash
dotnet publish src/TabloWatcherService.Api -c Release -o ./publish
```

Publishing automatically runs `npm ci` + `npm run build` for the SPA and drops the
built assets into `wwwroot`, so `./publish` is a single self-contained deployable:
`dotnet TabloWatcherService.Api.dll` serves both the API and the SPA on one port.
Browse to `http://<host>:5080/` to reach the SPA (or `http://<host>:5080/api/...`
for the API directly).

## Running as a service

### Linux (systemd)

1. Copy the publish output to the target machine, e.g. `/opt/tablowatcherservice`.
2. Create a dedicated user: `sudo useradd -r -s /usr/sbin/nologin tablowatcher`
   and `sudo chown -R tablowatcher:tablowatcher /opt/tablowatcherservice`.
3. Copy [deploy/tablowatcherservice.service](deploy/tablowatcherservice.service) to
   `/etc/systemd/system/` (adjust `WorkingDirectory`/`ExecStart` if you used a
   different install path).
4. Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tablowatcherservice
sudo systemctl status tablowatcherservice
journalctl -u tablowatcherservice -f
```

The app calls `UseSystemd()` in [Program.cs](src/TabloWatcherService.Api/Program.cs),
so systemd gets proper start/stop notifications and journal-integrated logging.

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

Whichever OS you run it on, opening the service to the LAN means opening the port
in the OS firewall:

```bash
# Linux (ufw example)
sudo ufw allow 5080/tcp
```

```powershell
# Windows
New-NetFirewallRule -DisplayName "TabloWatcherService" -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow
```

## Tablo Legacy API

See [Postman Collection](https://www.postman.com/flight-cosmologist-72572352-s-team/workspace/my-workspace/collection/21049791-6031e448-291e-4f4b-9099-876779d245bf?action=share&creator=33121888)
