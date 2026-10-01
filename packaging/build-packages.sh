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

# AppStream metadata for software centers (see packaging/linux/tablowatcherservice.metainfo.xml),
# with this release's notes: the titles of the pull requests merged since the previous tag.
# Needs the full history and tags (the release workflow checks out with fetch-depth: 0).
write_metainfo() {
    local out="$1" previous changes="" title
    previous="$(git -C "$REPO_ROOT" describe --tags --abbrev=0 --match 'v*' HEAD^ 2>/dev/null || true)"
    if [[ -n "$previous" ]]; then
        # A merge commit's body starts with the pull request's title.
        while IFS= read -r title; do
            [[ -n "$title" ]] || continue
            title="${title//&/&amp;}"
            title="${title//</&lt;}"
            title="${title//>/&gt;}"
            changes+="          <li>$title</li>"$'\n'
        done < <(git -C "$REPO_ROOT" log --merges --format='%b%x00' "$previous..HEAD" \
            | awk 'BEGIN { RS = "\0" } { sub(/^\n+/, ""); split($0, lines, "\n"); print lines[1] }')
    fi
    if [[ -n "$changes" ]]; then
        changes="        <p>Changes since ${previous#v}:</p>"$'\n'"        <ul>"$'\n'"$changes        </ul>"
    else
        changes="        <p>See the release notes on GitHub.</p>"
    fi

    local release_type=stable
    if [[ "$VERSION" == *-* ]]; then release_type=development; fi

    # The package version (0.1.0~preview1, see nfpm.yaml), so it matches what's installed.
    local template="$PACKAGING_DIR/linux/tablowatcherservice.metainfo.xml" line
    while IFS= read -r line; do
        if [[ "$line" == "@CHANGES@" ]]; then
            printf '%s\n' "$changes"
            continue
        fi
        line="${line//@VERSION@/${VERSION//-/\~}}"
        line="${line//@SEMVER@/$VERSION}"
        line="${line//@DATE@/$(date -u +%Y-%m-%d)}"
        line="${line//@RELEASE_TYPE@/$release_type}"
        printf '%s\n' "$line"
    done < "$template" > "$out"
}

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
    write_metainfo "$STAGING_DIR/tablowatcherservice.metainfo.xml"

    for packager in deb rpm; do
        echo "==> Building $packager ($arch)"
        # nfpm resolves the config's relative paths against the working directory.
        (cd "$PACKAGING_DIR" && ARCH="$arch" VERSION="$VERSION" \
            "$NFPM" package --config nfpm.yaml --packager "$packager" --target "$OUTPUT_DIR/")
    done
done

rm -rf "$STAGING_DIR"

# nfpm names pre-release files with the package version's "~" (…_0.1.0~preview1_amd64.deb),
# which GitHub rewrites to "." in release downloads - breaking SHA256SUMS. Use the semver "-"
# in file names instead; the version recorded inside each package keeps its "~".
for file in "$OUTPUT_DIR"/*; do
    if [[ "$file" == *"~"* ]]; then
        mv -- "$file" "${file//\~/-}"
    fi
done

(cd "$OUTPUT_DIR" && sha256sum -- *.deb *.rpm > SHA256SUMS)

echo "==> Built:"
ls -1 "$OUTPUT_DIR"
