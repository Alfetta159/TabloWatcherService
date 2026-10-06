# TabloWatcherService

A web app for watching live TV, browsing the guide and managing recordings on **legacy
Tablo DVR devices**, served from your own machine on your home network.

> This application is not associated with [Tablo](https://www.tablotv.com) or Nuvyyo in any official capacity. It is an independent effort to preserve the functionality of legacy Tablo devices.

- [Features](#features)
- [Getting started](#getting-started): [requirements](#requirements),
  [installing on Linux](#installing-on-linux), [using it](#using-it)
- [Configuration](#configuration) and [troubleshooting](#troubleshooting)
- [For developers](#for-developers): [local development](#local-development),
  [building](#building-for-production), [releases](#releases),
  [running as a service by hand](#running-as-a-service), [architecture](#architecture),
  [API](#api)

## Features

### Live TV

- **Guide grid:** a six-hour channels-by-time grid with a line at the current time. Use
  ‹ / › to page through time and **Now** to jump back. Channels appear right away; programs
  fill in once the server has finished loading listings from the device.
- **Watching:** click a channel's number/call sign to tune it and play it in the browser.
  Clicking a program only previews it, without interrupting what's playing. Your volume
  and mute setting are remembered.
- **Preview pane:** title, episode, description, artwork and poster for the selected
  program, with a **Record** / **Cancel recording** button. The split between the preview
  pane and the guide can be dragged.
- **Tuner labels:** each channel that's on one of the device's tuners shows "Tuner N",
  whether this app, another Tablo client or a recording is using it.
- **Picture-in-picture:** live TV keeps playing when you switch to another page, and a
  picture-in-picture player keeps playing when you close the dialog it came from.

### Recordings

- Everything recorded, as cards: one per TV show or program, and one per movie or sports
  event. Tabs for **All**, **TV Shows**, **Movies**, **Sports** and **Scheduled** (what's
  set to record next); sort by name or date recorded.
- Cards show what's recording right now, how many recordings there are, how many are
  unwatched or failed, and how much space they use.
- **TV shows and programs** open a dialog with every recording by season. Each one can be
  watched in place (resuming where you left off, or from the start), marked watched or
  unwatched, protected from being deleted automatically, or deleted. The **Delete** menu
  removes a whole season, everything watched, everything failed, or everything at once;
  protected recordings and ones still recording are left alone.
- **Movies and sports** open a player dialog that starts playing straight away, resuming
  where you left off. Recordings in progress can be stopped (keeping what's been recorded
  so far) and any recording can be deleted.

### Search

Search titles, episode titles, descriptions, cast and directors. Results are grouped by
show and can be collapsed, with the matching words highlighted and badges for which
fields matched. Any airing can be set to record from the results, and clicking one opens
its details - including copies you've already recorded - in a side panel.

### TV Shows, Movies and Sports

Posters for everything coming up in the guide, with the next airing, channels and genres.
Filter by channel, rating (and star rating for movies), sort by title or air date, and
filter by tags. Click a poster for its details:

- **TV shows:** set a series recording - new episodes or all, how many to keep, which
  channel, and how early to start or late to stop - or record individual episodes by
  season, or **Record all** at once.
- **Movies:** every upcoming airing, each with **Record** / **Cancel recording**.
- **Sports:** the teams (home team marked), venue and the airing to record.

Movies and sports events show whether they're scheduled or in conflict right on the poster.

### Tags

Every page with a **Tags** filter can also **exclude** tags - genres you never want to
see, say. Excluded tags apply everywhere (TV Shows, Movies, Sports and Search) and are
saved on the server, so they stay excluded on every device you use.

### Scheduled

Everything set to record, by day or by show, filterable by kind and channel. A banner
warns when two recordings clash for lack of free tuners, with a **Conflicts only** view to
sort them out. **Show skipped** also lists airings that won't be recorded, and why (for
example, already recorded).

### Settings

- **Channels:** every channel with its logo, resolution, what's on now and next, how far
  ahead the guide goes, how many airings are set to record, and how many recordings it
  has and the space they use. Filter by name, or show just favorites.
- **Storage:** each hard drive's capacity and free space (with a warning when nearly full),
  and a breakdown of space used by recordings, by category and title. Movies and sports
  can be selected and deleted from there to free up space.

## Getting started

### Requirements

- A legacy Tablo DVR on the same network as the machine running this app. With more than
  one Tablo on your account, the app uses the first one Tablo's servers report.
- A current browser (Chrome, Edge, Firefox or Safari). Video streams straight from the
  Tablo to the browser, so the browser must be able to reach the Tablo on the network too.
- On Linux, nothing else: the packages below include everything the app needs. Elsewhere,
  the [ASP.NET Core 10 runtime](https://dotnet.microsoft.com/download/dotnet/10.0) (see
  [Running as a service](#running-as-a-service)).

### Installing on Linux

Download the package for your system from the
[Releases](https://github.com/Alfetta159/TabloWatcherService/releases) page: `.deb` for
Debian, Ubuntu, Mint and Raspberry Pi OS; `.rpm` for Fedora and openSUSE. Pick `amd64` /
`x86_64` for a typical PC, or `arm64` / `aarch64` for a 64-bit Raspberry Pi. Then install
it from the folder you downloaded it to (keep the `./`):

```bash
sudo apt install ./tablowatcherservice_<version>_amd64.deb
```

```bash
sudo dnf install ./tablowatcherservice-<version>-1.x86_64.rpm
```

This installs the app to `/opt/tablowatcherservice` and starts it as the
`tablowatcherservice` service, which also starts at boot.

**Updating:** download the newer package from the Releases page and install it the same
way. It upgrades in place and keeps your settings.

**Uninstalling:** `sudo apt remove tablowatcherservice` or `sudo dnf remove
tablowatcherservice`. Your settings stay in `/opt/tablowatcherservice` in case you
reinstall; `sudo apt purge tablowatcherservice` removes them too.

If you previously installed with `deploy/install.sh`, first uninstall that with
`deploy/install.sh --uninstall`. Otherwise the unit file it installed takes precedence over
the package's own.

### Using it

Open `http://localhost:8080`, or **Tablo Watcher** in your app menu. From another device
on your network (a laptop, tablet or phone), use this computer's address on port 8080,
e.g. `http://192.168.1.20:8080`.

The first time it starts, the guide takes a few minutes to load - the Tablo only answers
one request at a time - and shows "Loading listings…" until then. After that it keeps
itself up to date in the background.

If other devices can't reach it, open the port in this computer's firewall:

```bash
sudo ufw allow 8080/tcp
```

Keep it on your home network: **don't port-forward it or otherwise expose it to the
internet.** The app has no login, and it can schedule, stop and delete recordings on your
Tablo.

To check on the service, or see its logs:

```bash
systemctl status tablowatcherservice
```

```bash
journalctl -u tablowatcherservice -f
```

## Configuration

Settings live in [appsettings.json](src/TabloWatcherService.Api/appsettings.json). Any of
them can be overridden with an environment variable, using `__` in place of `:` (for
example `Tablo__AiringsRefreshIntervalMinutes=30`). For the Linux service, add these as
`Environment=` lines in the systemd unit (`sudo systemctl edit tablowatcherservice`).

| Setting | Default | What it does |
| --- | --- | --- |
| `Kestrel:Endpoints:Http:Url` | `http://0.0.0.0:5080` (`8080` for the Linux service) | Address and port the app listens on |
| `Tablo:AssociationServerBaseUrl` | `https://api.tablotv.com` | Tablo's cloud association server |
| `Tablo:AiringsRefreshIntervalMinutes` | `15` | How often the guide is rebuilt from the device |
| `Tablo:RecordingsRefreshIntervalMinutes` | `15` | How often the list of recordings is refreshed from the device |
| `Logging:LogLevel:System.Net.Http.HttpClient` | `Warning` (`Trace` in Development) | How much detail to log about requests to Tablo; `Trace` logs every request |

Excluded tags are saved in `blocked-tags.json`, next to the app.

## Troubleshooting

- **The guide stays on "Loading listings…"**: the first load after a start takes a few
  minutes. If it never finishes, check the logs (`journalctl -u tablowatcherservice` for the
  service). Tablo's association server sometimes rate-limits requests (HTTP 429), especially
  after many restarts; the app retries every minute until it gets through.
- **A channel or recording won't play**: the browser plays the stream directly from the
  Tablo, so the device's IP must be reachable from the machine running the browser, not
  just from the server. All tuners being busy can also make tuning slow or fail.
- **A new recording doesn't show up yet**: the list of recordings is refreshed every 15
  minutes (see [Configuration](#configuration)).
- **The service won't start**: another process may already be using its port (8080 for the
  Linux service). Stop it or change the service's port (see [Configuration](#configuration)).

## For developers

### Local development

To build it you need the .NET 10 SDK and Node.js 20.19+ or 22.12+ (required by Vite).

#### Option 1: one command (SpaProxy)

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

#### Option 2: run both yourself

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

In Development, the guide and recordings caches are saved to `dev-guide-cache.json` and
`dev-recordings-cache.json` in the API project, so a restart doesn't have to wait on the
device to reload them.

#### Other frontend commands

Run from `src/tablowatcher-web`:

```bash
npm run build   # type-check and build into the API's wwwroot
npm run lint    # oxlint
```

New UI components come from shadcn/ui: `npx shadcn@latest add <component>` from
`src/tablowatcher-web` (see [components.json](src/tablowatcher-web/components.json)
for the configured style/aliases).

### Building for production

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

### Linux packages

```bash
packaging/build-packages.sh 0.1.0-preview1          # amd64 + arm64, .deb + .rpm
packaging/build-packages.sh 0.1.0-preview1 amd64    # just one architecture
```

This does a self-contained publish (the .NET runtime is bundled) for each architecture and
packages it with [nFPM](https://nfpm.goreleaser.com/install/), which you need installed.
Packages and a `SHA256SUMS` file land in `packaging/dist/`. The package definition is
[packaging/nfpm.yaml](packaging/nfpm.yaml), with the systemd unit, app-menu launcher and
install/remove scripts in [packaging/linux](packaging/linux).

### Releases

Merging to `main` doesn't release anything by itself. To publish a release, push a version
tag. The [Release workflow](.github/workflows/release.yml) builds the packages and attaches
them to a GitHub release, whose notes start with download and install instructions from
[packaging/release-notes.md](packaging/release-notes.md) (`@VERSION@` is filled in with the
tag's version) above the generated list of changes. A tag with a `-` suffix (like
`v0.1.0-preview1`) becomes a pre-release:

```bash
git tag v0.1.0-preview1
git push origin v0.1.0-preview1
```

The workflow also pushes the `.deb` and `.rpm` packages to the
[Cloudsmith](https://cloudsmith.io/~alfetta159/repos/tablo-watcher-service/) repository
`alfetta159/tablo-watcher-service`. It authenticates with a `CLOUDSMITH_API_KEY` repository
secret (Settings → Secrets and variables → Actions), which must be set before tagging.

### Running as a service

#### Linux (systemd)

To run your own build as a service instead of a released package, use the install script.
Run it from the repo as your normal user, not with `sudo`; it asks for your password when
it needs it:

```bash
deploy/install.sh
```

It builds the app, creates a `tablowatcher` system user if needed, copies the build to
`/opt/tablowatcherservice`, installs [deploy/tablowatcherservice.service](deploy/tablowatcherservice.service),
and starts the service so it also starts at boot. Run it again whenever you want to update
the service to your latest code.

To remove it again - the service, its unit file, `/opt/tablowatcherservice` and the
`tablowatcher` user:

```bash
deploy/install.sh --uninstall
```

The service listens on port **8080** (browse to `http://<host>:8080/`), set by the unit
file, so it can run alongside a development session on 5080. To use a different port,
change the `Kestrel__Endpoints__Http__Url` line in the unit file and re-run
`deploy/install.sh`.

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

The app calls `UseSystemd()` in [Program.cs](src/TabloWatcherService.Api/Program.cs),
so systemd gets proper start/stop notifications and journal-integrated logging.

#### Windows (Windows Service)

There's no Windows installer yet; build it with `dotnet publish` (see above), then:

1. Copy the publish output to the target machine, e.g. `C:\Services\TabloWatcherService`.
2. Create the service (elevated PowerShell):

```powershell
New-Service -Name "TabloWatcherService" `
  -BinaryPathName "C:\Services\TabloWatcherService\TabloWatcherService.Api.exe" `
  -DisplayName "Tablo Watcher Service" `
  -StartupType Automatic
Start-Service TabloWatcherService
```

To reach it from other machines, open its port (5080 by default) in the firewall:

```powershell
New-NetFirewallRule -DisplayName "TabloWatcherService" -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow
```

The app calls `UseWindowsService()`, so it integrates with the Windows Service
Control Manager (start/stop, Windows Event Log) the same way `UseSystemd()` does
on Linux. `UseSystemd()`/`UseWindowsService()` are no-ops on the "wrong" OS or when
just running `dotnet run`, so the same build works everywhere.

### Architecture

A single ASP.NET Core (.NET 10) host serves both the REST API (under `/api`) and a
React + Vite + TypeScript single-page app, on one port. In production this is one
process to run and one port to open — no reverse proxy required. The SPA calls the
API same-origin, so no CORS configuration is needed outside of local development.

- [src/TabloWatcherService.Api](src/TabloWatcherService.Api) — ASP.NET Core Web API + static file host
- [src/tablowatcher-web](src/tablowatcher-web) — React SPA (Vite, TypeScript, Tailwind CSS, shadcn/ui)
- [deploy](deploy) — systemd unit and install script for running your own build as a Linux service
- [packaging](packaging) — Linux package definition and scripts

The API talks to two Tablo endpoints:

- **Tablo's cloud association server** (`https://api.tablotv.com`), to discover which
  Tablo devices are on your account and their local IP addresses.
- **The Tablo device's own local API** (port 8885), for channels, guide data, recordings,
  images, tuners and starting streams.

Two background services keep in-memory caches of the device's guide and recordings,
refreshed every 15 minutes (see [Configuration](#configuration)), so most pages are served
without a device call per request. The first guide build after startup takes a few
minutes, since the device only answers one request at a time.

The API binds to `0.0.0.0:5080` by default (see `Kestrel:Endpoints:Http:Url` in
[appsettings.json](src/TabloWatcherService.Api/appsettings.json)), so it's reachable
from other machines on the LAN, not just `localhost`. There is no login, so restrict
`AllowedHosts` / firewall rules if that's more exposure than you want.

### API

The main endpoints the web app uses. They all talk to the first device the association
server reports.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/servers` | Tablo devices on your account, with their local IPs |
| `GET /api/guide/grid?from=&to=` | Guide grid: channels with their airings in a time window |
| `GET /api/channels` | Channels with guide and recording stats (Settings → Channels) |
| `POST /api/watch/{channelId}` | Tune a channel; returns the HLS `playlistUrl` to play |
| `GET /api/watch/{channelId}/tuner` | Which tuner a just-tuned channel landed on |
| `GET /api/watch/tuners` | The channel on each busy tuner |
| `GET /api/tv-shows`, `/api/tv-shows/{seriesId}` | Upcoming shows; one show's details, recording options and episodes |
| `PUT /api/tv-shows/{seriesId}/recording` | Set a series recording (rule, keep, channel, start/stop offsets) |
| `GET /api/movies`, `/api/movies/{movieId}` | Upcoming movies; one movie's details and airings |
| `GET /api/sports` | Upcoming sports events |
| `PUT /api/airings/schedule` | Record, or cancel recording, one airing |
| `GET /api/schedule?includeSkipped=` | Everything set to record, with conflicts |
| `GET /api/search?q=`, `/api/search/details?path=` | Search the guide; full details for one result |
| `GET /api/tags?kind=`, `PUT /api/tags/blocked` | Tags for a page; set the excluded tags |
| `GET /api/recordings`, `/api/recordings/scheduled` | Recordings as cards; upcoming recordings |
| `GET /api/recordings/series/{id}`, `/programs/{id}`, `/movies/{id}`, `/sports/{eventId}` | One show's, movie's or sports event's recordings |
| `POST /api/recordings/watch` | Start playing a recording; returns the HLS `playlistUrl` |
| `PATCH /api/recordings` | Mark a recording watched/unwatched and/or protected |
| `POST /api/recordings/stop`, `/api/recordings/delete` | Stop a recording in progress; delete a recording |
| `GET /api/storage/hard-drives`, `/api/storage/recordings` | Drive capacity; space used by recordings |
| `GET /api/images/{imageId}` | An image from the device |
| `GET /api/images/background` / `thumbnail` `?seriesPath=` or `?moviePath=` | Redirects to a series' or movie's background or poster image |

Raw series, season, movie and channel details from the device are under
`/api/guide-series`, `/api/guide-series-seasons`, `/api/guide-movies` and
`/api/guide-channels`; these take the device's `ip` (and optionally `port`, default `8885`)
as query parameters. Several other device endpoints exist in
[Controllers](src/TabloWatcherService.Api/Controllers) but are currently commented out.

## Tablo Legacy API

See [Postman Collection](https://www.postman.com/flight-cosmologist-72572352-s-team/workspace/my-workspace/collection/21049791-6031e448-291e-4f4b-9099-876779d245bf?action=share&creator=33121888)

## Special Thanks To:

- [tablo-api-docs](https://github.com/jessedp/tablo-api-docs)
- [tablo-legacy-m3u](https://github.com/gtronset/tablo-legacy-m3u)
