#!/usr/bin/env bash
# Builds TabloWatcherService and installs (or updates) it as a systemd service.
#
# Run from anywhere as your normal user - not with sudo. The build runs as you (so no
# root-owned files end up in the repo); only the system steps use sudo, which will ask
# for your password.
#
#   deploy/install.sh
#
# Safe to re-run: the first run installs the service, later runs update it in place.
set -euo pipefail

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

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    port="$(grep -oP 'Http__Url=http://[^:]+:\K[0-9]+' "$UNIT_FILE" || echo 5080)"
    echo "==> $SERVICE_NAME is running at http://$(hostname -I | awk '{print $1}'):$port"
    echo "    Logs:   journalctl -u $SERVICE_NAME -f"
    echo "    Status: systemctl status $SERVICE_NAME"
else
    echo "==> $SERVICE_NAME failed to start. Recent logs:" >&2
    sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager >&2
    exit 1
fi
