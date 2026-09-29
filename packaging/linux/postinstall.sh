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
