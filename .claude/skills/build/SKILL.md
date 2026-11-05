---
name: build
description: Run, build, package or install Spontaneous on this Mac. Use when asked to run the app, start dev, build the app, make a DMG, package it, or install the latest build.
---

## Pick the job

What did the user ask for?
├── Run it or try a change → Dev run
├── A DMG, a build or a package → Package
└── Install it, or update the installed app → Package, then Install

Every command runs from `/Users/anmol/code/sptn`. Shells here don't load the user's setup, so start each one with:

```bash
source ~/.nvm/nvm.sh >/dev/null && nvm use 26.13.0 >/dev/null; export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.local/bin:$PATH"
```

## Preflight

Stop and report if either check fails:

- `df -h ~` shows at least 10 GB free. A clean build's cache is about 8.5 GB, and a full disk fails halfway through with confusing errors.
- `/Users/anmol/code/sptn/target` doesn't exist. If it does, Cargo lost its external build folder: run `bash scripts/use-external-target.sh`, then delete `target` once no app is running from it.

## Dev run

Run `npm run tauri:dev` in the background, or in a Terminal tab the user can see. It keeps running until stopped.

- It's ready when the log prints a `Running` line with a path under `~/Builds/sptn.noindex/target/debug`. Any other path breaks the build-folder rule, so stop it and fix that first.
- The first run after a cache change rebuilds for about 5 minutes. Later runs take seconds.
- It runs as "Spontaneous Dev" with its own bundle ID, so macOS may ask for permissions separately from the installed app.

## Package

1. Run `npm run package` in the background. It takes about a minute when the cache is warm, and 5 or more when it isn't.
2. It succeeds only if the last line of output is a path in `~/Builds/sptn.noindex/dmg/`. Anything else is a failure: report the last error line.
3. Check the build before reporting it:
   - `hdiutil verify "<dmg>"` ends in `VALID`.
   - `codesign -dv ~/Builds/sptn.noindex/target/release/bundle/macos/Spontaneous.app` shows `TeamIdentifier=K2Z889W2SW`. An ad hoc signature means the certificate wasn't found, and screen recording permission won't stick.
4. Give the user the DMG path. Never give a path inside the repo.

The notarization warning in the log is expected until a Developer ID is set up. Ignore it.

## Install

Only when the user asked to install. It replaces the app in `/Applications`.

1. If the installed app is running (`pgrep -f /Applications/Spontaneous.app/`), ask the user before quitting it, because they may be recording. Quit it with `osascript -e 'quit app "Spontaneous"'`.
2. Mount the DMG with `hdiutil attach -nobrowse -readonly "<dmg>"`, and take the mount point from the last line, usually `/Volumes/Spontaneous`.
3. `rm -rf /Applications/Spontaneous.app`, then `ditto "<mount>/Spontaneous.app" /Applications/Spontaneous.app`. Removing first matters: `ditto` merges into an existing app and would leave old files behind.
4. Run `hdiutil detach "<mount>"`.
5. Confirm with `defaults read /Applications/Spontaneous.app/Contents/Info.plist CFBundleShortVersionString` and the same `codesign` check as above.

Never use an uninstaller or app cleaner. One trashed this whole repo because the folder shared the app's name.

## Rules

- Never run plain `tauri build` for an installer. Only `npm run package` picks the signing certificate.
- Never move or copy build output into the repo, and never name a folder under `~/Builds` after the app.
- Never delete `~/Builds/sptn.noindex/dmg`. It holds the user's earlier builds, which are the only way back to a version that worked.
- Deleting `~/Builds/sptn.noindex/target` is safe when disk space runs out. The next build just takes longer.
