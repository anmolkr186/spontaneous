# Spontaneous

A macOS Tauri v2 app: record UI, annotate frames, and have the user's own Claude Code turn notes into video edits. Read `docs/ARCHITECTURE.md` before structural work, and `docs/AGENT_HARNESS.md` before touching what the agent sees.

## Build and run

The `build` skill in `.claude/skills/build` covers running the app, building a DMG and installing it. The `release` skill covers versions and GitHub releases. `docs/COMMANDS.md` is the same material written for the user.

| Command | What it does |
|---|---|
| `npm run tauri:dev` | Runs "Spontaneous Dev" (its own bundle ID) with live reload. Long-running. |
| `npm run package` | Builds and signs the real app and copies the DMG to `~/Builds/sptn.noindex/dmg`. |
| `npm run typecheck` | TypeScript only. Run it before every commit. |
| `cargo test -p spontaneous --lib agent -- --include-ignored` | Agent host tests, including ones that call the real CLI and use a little plan usage. |

Shells here don't load the user's setup. Start each command with:

```bash
source ~/.nvm/nvm.sh >/dev/null && nvm use 26.13.0 >/dev/null; export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.local/bin:$PATH"
```

## Rules

- Never put build output or a DMG inside the repo. App cleaners matched this folder by name and trashed the whole project, so all build output lives in `~/Builds/sptn.noindex`. A gitignored `.cargo/config.toml` points Cargo there, and `scripts/use-external-target.sh` recreates it before every `npm run tauri` command. If a log shows `~/code/sptn/target`, stop and fix that first.
- Never build an installer with plain `tauri build`. Only `npm run package` picks the signing certificate, and without it the app loses its screen-recording permission on every build.
- Never run an app cleaner or uninstaller on Spontaneous. To remove the app, delete `/Applications/Spontaneous.app`. The user's recordings live in `~/Movies/Spontaneous`, which matches the app's name too.
- Never name `~/Builds/sptn.noindex` folders after the app. The odd name and the `.noindex` suffix keep cleaners and Spotlight from matching them.
- Commit only files you changed. Other sessions and GitHub Desktop work in this checkout too, and GitHub Desktop stashes untracked files when switching branches.
- The agent panel runs the user's own `claude` CLI on their plan login. Never read, store or ask for a credential, and never pass `--bare`. `docs/ARCHITECTURE.md` section 7 has the full list.
