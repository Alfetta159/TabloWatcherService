#!/usr/bin/env bash
# Builds TabloWatcherService and installs (or updates) it as a systemd service.
#
# Run from anywhere as your normal user - not with sudo. The build runs as you (so no
# root-owned files end up in the repo); only the system steps use sudo, which will ask
# for your password.
#
#   deploy/install.sh [--hostname NAME]
#
# The service listens on port 80, so on the LAN it's at http://<this machine's
# hostname>.local/ (advertised by avahi-daemon). --hostname renames this machine first -
# e.g. --hostname tabloid for http://tabloid.local/. Renaming affects everything that
# knows the machine by name (SSH, other services), so it only happens when asked.
#
# Safe to re-run: the first run installs the service, later runs update it in place.
set -euo pipefail

usage() {
    echo "Usage: $0 [--hostname NAME]" >&2
    exit 2
}

NEW_HOSTNAME=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --hostname)
            [[ $# -ge 2 ]] || usage
            NEW_HOSTNAME="$2"
            shift 2
            ;;
        -h|--help) usage ;;
        *) usage ;;
    esac
done

# A single DNS label: letters, digits and hyphens, not starting or ending with a hyphen.
if [[ -n "$NEW_HOSTNAME" && ! "$NEW_HOSTNAME" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]]; then
    echo "--hostname must be letters, digits and hyphens (no dots), e.g. tabloid" >&2
    exit 2
fi

SERVICE_NAME=tablowatcherservice
SERVICE_USER=tablowatcher
INSTALL_DIR=/opt/tablowatcherservice

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLISH_DIR="$REPO_ROOT/publish"
UNIT_FILE="$REPO_ROOT/deploy/$SERVICE_NAME.service"

if [[ $EUID -eq 0 ]]; then
    echo "Run this as your normal user, not root/sudo - it calls sudo itself where needed." >&2
    exit 1
fi

PORT="$(grep -oP 'Http__Url=http://[^:]+:\K[0-9]+' "$UNIT_FILE" || echo 80)"

# Something else on the service's port (typically another web server on 80) would stop it
# from starting - check before touching anything. Our own running service is fine: this
# run replaces it.
own_pid="$(systemctl show -p MainPID --value "$SERVICE_NAME" 2>/dev/null || echo 0)"
other_listeners="$(sudo ss -ltnpH "sport = :$PORT" | grep -v "pid=$own_pid," || true)"
if [[ -n "$other_listeners" ]]; then
    echo "Port $PORT is already in use by another program:" >&2
    echo "$other_listeners" >&2
    echo "Stop it, or change the port on the Kestrel__Endpoints__Http__Url line in $UNIT_FILE." >&2
    exit 1
fi

echo "==> Building (API + web app) into $PUBLISH_DIR"
rm -rf "$PUBLISH_DIR"
dotnet publish "$REPO_ROOT/src/TabloWatcherService.Api" -c Release -o "$PUBLISH_DIR"

if ! id "$SERVICE_USER" &>/dev/null; then
    echo "==> Creating system user '$SERVICE_USER'"
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "==> Stopping running service"
    sudo systemctl stop "$SERVICE_NAME"
fi

echo "==> Copying build to $INSTALL_DIR"
# Replace the old files entirely so nothing stale from a previous version is left behind.
sudo rm -rf "$INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR"
sudo cp -r "$PUBLISH_DIR/." "$INSTALL_DIR/"
sudo chown -R root:root "$INSTALL_DIR"

echo "==> Installing systemd unit"
sudo cp "$UNIT_FILE" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo "==> Starting service"
sudo systemctl start "$SERVICE_NAME"

if [[ -n "$NEW_HOSTNAME" && "$NEW_HOSTNAME" != "$(hostname)" ]]; then
    echo "==> Renaming this machine to '$NEW_HOSTNAME'"
    sudo hostnamectl set-hostname "$NEW_HOSTNAME"
    # So avahi advertises the new name right away rather than at the next boot.
    if systemctl is-active --quiet avahi-daemon; then
        sudo systemctl restart avahi-daemon
    fi
fi

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    port_suffix=""
    [[ "$PORT" != 80 ]] && port_suffix=":$PORT"
    echo "==> $SERVICE_NAME is running at http://$(hostname -I | awk '{print $1}')$port_suffix/"
    if systemctl is-active --quiet avahi-daemon; then
        echo "    On the LAN:  http://$(hostname).local$port_suffix/"
    else
        echo "    For a friendly LAN name (http://$(hostname).local$port_suffix/), install avahi-daemon:"
        echo "      sudo apt install avahi-daemon"
    fi
    echo "    Logs:   journalctl -u $SERVICE_NAME -f"
    echo "    Status: systemctl status $SERVICE_NAME"
else
    echo "==> $SERVICE_NAME failed to start. Recent logs:" >&2
    sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager >&2
    exit 1
fi
