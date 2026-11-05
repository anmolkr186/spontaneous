#!/usr/bin/env bash
# Builds the macOS installer and copies the DMG out of the build tree.
#
# App cleaners match leftovers by name and bundle id, so on a Mac the build
# tree and the installers live in a folder that matches neither. The .noindex
# suffix keeps the built Spontaneous.app out of Spotlight. use-external-target.sh
# sets the Cargo side of this; CI builds in ./target.
#
#   npm run package                  build, DMG lands in ~/Builds/sptn.noindex/dmg
#   npm run package -- --debug       extra arguments go to `tauri build`
#   ARTIFACT_DIR=out npm run package choose where the DMG goes
#
# On a Mac the signing identity is picked from the keychain, preferring
# Developer ID. Set APPLE_SIGNING_IDENTITY to override it; CI sets it to "-".
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

command -v cargo >/dev/null || export PATH="/opt/homebrew/opt/rustup/bin:$PATH"

if [[ -n "${CI:-}" ]]; then
  artifact_dir="${ARTIFACT_DIR:-$root/artifacts}"
else
  artifact_dir="${ARTIFACT_DIR:-$HOME/Builds/sptn.noindex/dmg}"
  if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
    identities="$(security find-identity -v -p codesigning)"
    identity="$(sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' <<< "$identities" | head -1)"
    [[ -n "$identity" ]] || identity="$(sed -n 's/.*"\(Apple Development: .*\)"/\1/p' <<< "$identities" | head -1)"
    if [[ -z "$identity" ]]; then
      echo "No signing identity in the keychain. Set APPLE_SIGNING_IDENTITY." >&2
      exit 1
    fi
    export APPLE_SIGNING_IDENTITY="$identity"
  fi
fi

stamp="$(mktemp)"
trap 'rm -f "$stamp"' EXIT

npm run tauri build -- "$@"

target_dir="$(cargo metadata --no-deps --format-version 1 \
  | node -p 'JSON.parse(require("fs").readFileSync(0)).target_directory')"
dmg="$(find "$target_dir" -maxdepth 5 -path '*/bundle/dmg/*.dmg' ! -name 'rw.*' -newer "$stamp" -print -quit)"

if [[ -z "$dmg" ]]; then
  echo "No new DMG under $target_dir" >&2
  exit 1
fi

mkdir -p "$artifact_dir"
cp -f "$dmg" "$artifact_dir/"
echo "$artifact_dir/$(basename "$dmg")"
