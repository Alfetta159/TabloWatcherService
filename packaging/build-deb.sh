#!/usr/bin/env bash
# Builds a self-contained .deb for amd64 - bundles the .NET runtime, so installing it
# doesn't require dotnet (or Microsoft's apt feed) on the target machine at all.
#
#   packaging/build-deb.sh [version]
#
# Requires fpm (gem install --no-document fpm) and dotnet on the machine building the
# package - neither is needed on the machine installing the resulting .deb. It recommends
# avahi-daemon, which advertises the machine as <hostname>.local, so browsers on the LAN
# can reach the service by name.
set -euo pipefail

VERSION="${1:-1.0.0}"
ARCH=amd64
RID=linux-x64

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING_DIR="$REPO_ROOT/packaging/staging"
OUTPUT_DIR="$REPO_ROOT/packaging/dist"
APP_DIR="$STAGING_DIR/opt/tablowatcherservice"

if ! command -v fpm &>/dev/null; then
    echo "fpm not found. Install it with: sudo apt-get install ruby ruby-dev build-essential && sudo gem install --no-document fpm" >&2
    exit 1
fi

echo "==> Publishing self-contained ($RID)"
rm -rf "$STAGING_DIR"
mkdir -p "$APP_DIR"
dotnet publish "$REPO_ROOT/src/TabloWatcherService.Api" \
    -c Release \
    -r "$RID" \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:DebugType=none \
    -o "$APP_DIR"

echo "==> Building .deb with fpm"
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/tablowatcherservice_${VERSION}_${ARCH}.deb"

fpm -s dir -t deb \
    -n tablowatcherservice \
    -v "$VERSION" \
    --architecture "$ARCH" \
    --description "Watch and configure recordings for legacy Tablo DVR devices" \
    --url "https://github.com/Alfetta159/TabloWatcherService" \
    --maintainer "Alfetta159" \
    --license "MIT" \
    --depends "libc6" \
    --deb-recommends "avahi-daemon" \
    --after-install "$REPO_ROOT/packaging/debian/postinst.sh" \
    --deb-systemd "$REPO_ROOT/packaging/debian/tablowatcherservice.service" \
    --deb-systemd-enable \
    --deb-systemd-auto-start \
    --deb-systemd-restart-after-upgrade \
    -C "$STAGING_DIR" \
    -p "$OUTPUT_DIR/tablowatcherservice_${VERSION}_${ARCH}.deb" \
    opt

echo "==> Built $OUTPUT_DIR/tablowatcherservice_${VERSION}_${ARCH}.deb"
