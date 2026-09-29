#!/bin/sh
# Stops the service only when the package is actually being removed, not upgraded
# (deb passes "remove"; rpm passes 0 on removal, 1 on upgrade). On an rpm upgrade this runs
# *after* the new version's postinstall, so stopping here would leave the service down.
set -e

SERVICE_NAME=tablowatcherservice

case "$1" in
    remove|0)
        if [ -d /run/systemd/system ]; then
            systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
        fi
        ;;
esac

exit 0
