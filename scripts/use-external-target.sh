#!/usr/bin/env bash
# Points Cargo at a build folder outside the repo, on a Mac only. Runs before
# every npm tauri command, so a fresh clone or a lost config can't rebuild in
# ./target. The file is gitignored; CI has none and builds in ./target.
set -euo pipefail

[[ -z "${CI:-}" ]] || exit 0

cd "$(dirname "$0")/.."
if [[ ! -f .cargo/config.toml ]]; then
  mkdir -p .cargo
  printf '[build]\ntarget-dir = "%s/Builds/sptn.noindex/target"\n' "$HOME" > .cargo/config.toml
fi
