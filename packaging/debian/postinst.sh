#!/bin/sh
# Runs after files are unpacked, before fpm's own systemd enable/start logic (which it
# appends after this script's content) - so the service user exists first.
set -e

SERVICE_USER=tablowatcher
INSTALL_DIR=/opt/tablowatcherservice

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

exit 0
