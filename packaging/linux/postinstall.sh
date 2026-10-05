#!/bin/sh
# Runs after the files are unpacked, on both install and upgrade (deb passes "configure";
# rpm passes 1 on install, 2 on upgrade) - every step here is safe to repeat.
set -e

SERVICE_NAME=tablowatcherservice
SERVICE_USER=tablowatcher
INSTALL_DIR=/opt/tablowatcherservice
PORT=8080

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# The service writes its runtime state (e.g. blocked-tags.json) next to the app.
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# A unit left in /etc by deploy/install.sh (the pre-package manual install) overrides this
# package's own in /usr/lib, and runs `dotnet TabloWatcherService.Api.dll` - a file this
# package doesn't ship, so the service would keep running that old build while serving the
# new pages. Moved aside (systemd ignores the new name) only when it's recognizably that unit;
# any other override is the admin's, and left alone.
LEGACY_UNIT="/etc/systemd/system/$SERVICE_NAME.service"
if [ -f "$LEGACY_UNIT" ] && grep -q 'TabloWatcherService\.Api\.dll' "$LEGACY_UNIT"; then
    mv "$LEGACY_UNIT" "$LEGACY_UNIT.from-install-sh"
    echo
    echo "Moved the old deploy/install.sh unit aside to $LEGACY_UNIT.from-install-sh"
    echo "so the service runs this package's version. You can delete that file."
fi

# Skipped where systemd isn't running (containers, chroots) - the files are still installed.
if [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
    # restart, not start, so an upgrade picks up the new files.
    systemctl restart "$SERVICE_NAME"
fi

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Tablo Watcher is installed and running as the '$SERVICE_NAME' service."
echo "  Open it:            http://localhost:$PORT (or 'Tablo Watcher' in your app menu)"
if [ -n "$ip" ]; then
    echo "  From other devices: http://$ip:$PORT (allow $PORT/tcp through your firewall)"
fi
echo "  Logs:               journalctl -u $SERVICE_NAME -f"
echo

exit 0
