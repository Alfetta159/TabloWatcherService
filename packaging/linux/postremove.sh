#!/bin/sh
# Removal leaves the service user and runtime state (e.g. blocked-tags.json) in
# /opt/tablowatcherservice, so reinstalling keeps your settings. `apt purge` (deb only -
# rpm has no equivalent) removes those too.
set -e

SERVICE_USER=tablowatcher
INSTALL_DIR=/opt/tablowatcherservice

if [ -d /run/systemd/system ]; then
    systemctl daemon-reload || true
fi

if [ "$1" = "purge" ]; then
    rm -rf "$INSTALL_DIR"
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        userdel "$SERVICE_USER" || true
    fi
fi

exit 0
