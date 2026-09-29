#!/usr/bin/env bash
# Builds self-contained .deb and .rpm packages - they bundle the .NET runtime, so installing
# one doesn't require dotnet (or Microsoft's package feed) on the target machine at all.
#
#   packaging/build-packages.sh [version] [arch...]
#
#   version  semver, e.g. 0.1.0-preview1 (default: 0.0.0-dev)
#   arch     amd64 and/or arm64 (default: both)
#
# Output goes to packaging/dist/, along with a SHA256SUMS file. Requires dotnet, node and
# nfpm (https://nfpm.goreleaser.com/install/) on the machine building the packages - none of
# them are needed on the machine installing them. Set NFPM to use an nfpm not on PATH.
set -euo pipefail

VERSION="${1:-0.0.0-dev}"
shift || true
if (($#)); then ARCHES=("$@"); else ARCHES=(amd64 arm64); fi
NFPM="${NFPM:-nfpm}"

PACKAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$PACKAGING_DIR")"
STAGING_DIR="$PACKAGING_DIR/staging"
APP_DIR="$STAGING_DIR/opt/tablowatcherservice"
OUTPUT_DIR="$PACKAGING_DIR/dist"

if ! command -v "$NFPM" &>/dev/null; then
    echo "nfpm not found. Install it from https://nfpm.goreleaser.com/install/ (or set NFPM=/path/to/nfpm)." >&2
    exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

for arch in "${ARCHES[@]}"; do
    case "$arch" in
        amd64) rid=linux-x64 ;;
        arm64) rid=linux-arm64 ;;
        *) echo "Unsupported arch '$arch' (expected amd64 or arm64)" >&2; exit 1 ;;
    esac

    echo "==> Publishing self-contained ($rid)"
    rm -rf "$STAGING_DIR"
    mkdir -p "$APP_DIR"
    dotnet publish "$REPO_ROOT/src/TabloWatcherService.Api" \
        -c Release \
        -r "$rid" \
        --self-contained true \
        -p:PublishSingleFile=true \
        -p:DebugType=none \
        -p:Version="$VERSION" \
        -o "$APP_DIR"
    # Development settings (dev caches, verbose logging) have no business on an installed system.
    rm -f "$APP_DIR/appsettings.Development.json"

    for packager in deb rpm; do
        echo "==> Building $packager ($arch)"
        # nfpm resolves the config's relative paths against the working directory.
        (cd "$PACKAGING_DIR" && ARCH="$arch" VERSION="$VERSION" \
            "$NFPM" package --config nfpm.yaml --packager "$packager" --target "$OUTPUT_DIR/")
    done
done

rm -rf "$STAGING_DIR"
(cd "$OUTPUT_DIR" && sha256sum -- *.deb *.rpm > SHA256SUMS)

echo "==> Built:"
ls -1 "$OUTPUT_DIR"
