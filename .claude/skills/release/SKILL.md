---
name: release
description: Cut a Spontaneous release. Use when asked to release, ship, tag or publish a version.
---

## Preflight

Stop and report if any check fails:

- The branch is main, the tree is clean, and it matches origin.
- `npm run typecheck` passes.
- The tag for the next version doesn't already exist.

## Pick the version

Does this release break existing projects or recordings?
├── Yes → `minor` while below 1.0, and say so in the notes
└── No
    ├── Is it for testers only? → `prerelease --preid beta`
    ├── Does it add a feature? → `minor`
    └── Otherwise → `patch`

## Release

1. Run `npm version <level>`. It syncs Cargo, commits, tags and pushes.
2. Wait for the Release workflow. It creates a draft on GitHub.
3. Rewrite the generated notes for users. Say what changed for them, not which files moved.
4. Give the user the draft link and stop.
5. After the user's yes, run `gh release edit <tag> --draft=false`.

## Rules

- Never publish without the user's yes in this conversation. A published installer can't be recalled from people who downloaded it.
- Never move or reuse a tag. If a build fails, fix it and bump the patch version, so each version number maps to one build.
- Never give an installer path inside the repo. Local DMGs live in `~/Builds/sptn.noindex/dmg`, because uninstallers can trash the repo folder.
- Until a Developer ID is set up, call releases test builds. They are signed ad hoc and macOS will block them on other people's machines.
