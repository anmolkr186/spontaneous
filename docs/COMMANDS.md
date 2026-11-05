# Command guide

Run every command from `~/code/sptn`. That's also the folder to select for a session.

Never select `~/Builds/sptn.noindex`. It only holds build output, and you open it in Finder to get a DMG.

## Setup for a new terminal

Run this once in each new terminal to get Node 26:

```bash
nvm use
```

## Commands

| Command | Use it when | What it does | Where the result goes |
|---|---|---|---|
| `npm run tauri:dev` | Day-to-day work | Runs the app as "Spontaneous Dev" with live reload | Opens the app. The build cache goes in `~/Builds/sptn.noindex/target` |
| `npm run package` | You want a version to install | Builds and signs the real app, then copies out the DMG | `~/Builds/sptn.noindex/dmg` |
| `npm version patch` | Shipping a fix | Checks you're on `main`, runs the typecheck, bumps the version, then commits, tags and pushes | GitHub builds the DMG and creates a draft release |
| `npm version minor` | Shipping a feature | Same, with a larger version bump | Same |
| `npm version prerelease --preid beta` | Shipping to testers | Same, with a version like `0.1.1-beta.0` | Draft marked as a prerelease |
| `gh release edit v0.2.0 --draft=false` | You've checked the draft | Publishes that release. Use the real version number | The GitHub release page, for anyone who can see the repo |

## A typical day

1. Open `~/code/sptn` and start the app:

   ```bash
   npm run tauri:dev
   ```

2. Press `Ctrl+C` in that terminal to stop it.
3. Commit and push your changes. GitHub runs the checks.
4. To install your own build, run this, then open the DMG from `~/Builds/sptn.noindex/dmg`:

   ```bash
   npm run package
   ```

## Shipping a release

1. Commit your work and get onto `main`. `npm version` refuses to run on any other branch or with uncommitted changes.
2. Run the `npm version` command that fits the release.
3. Wait for the Release workflow on GitHub, then read the draft.
4. Publish it with `gh release edit`.

You can also ask Claude to "cut a release" in a session here. It runs the checks, picks the version and stops at the draft until you say yes.

Until a Developer ID certificate and notarization are set up, GitHub's DMGs are test builds, and macOS will block them on other people's machines. Install from `npm run package` for now.

## Rules

- Always build installers with `npm run package`. A direct `tauri build` doesn't pick a signing certificate, and screen capture may break.
- Never move or reuse a release tag. If a build fails, fix it and bump the patch version.
- To remove the installed app, delete `/Applications/Spontaneous.app` yourself, or read the uninstaller's list before you confirm. It may also match `~/Movies/Spontaneous`, where your recordings live.

## If something goes wrong

| What you see | Cause | Fix |
|---|---|---|
| `failed to run 'cargo metadata'` | The terminal can't find Rust | Run `source ~/.zshrc` or open a new terminal |
| The `Running` line shows `~/code/sptn/target` | Cargo lost the external build setting | Stop the app, delete `~/code/sptn/target`, then start it again with `npm run tauri:dev` |
| `npm version` fails right away | You're not on `main`, there are uncommitted changes, or the typecheck failed | Read the error, fix that, and run it again |
| The disk is full | The build cache has grown | Delete `~/Builds/sptn.noindex/target`. The next build is slower, but nothing is lost |
