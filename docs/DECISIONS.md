# Decisions

What's been decided, what's waiting on a decision, and what's decided but not built yet. Read this before building anything related; update it in the same change that makes or changes a decision. If new work would contradict an entry, stop and raise it instead of quietly diverging.

Each entry: **what**, **why**, **where it lives**, and the date. Dates are when it was decided, not when it was written down.

## Open: needs a decision

Nothing open right now.

## To do: decided, not built yet

- **Seven UI tools for the MCP server** (2026-11-06)
  - The agent UI catalog relies on tools the server doesn't serve yet: `propose_plan`, `propose_text_edit`, `request_permission`, `try_variants`, `suggest_shot`, `answer_with_moments`, `reply_to_note`. `ask_user` and `resolve_annotation` exist.
  - Each tool may carry an optional `cta` field, with labels checked by `src/ui/cta/validate.ts`.
  - Spec: `docs/AGENT_UI.md` (generated from `src/ui/agent-ui/catalog.ts`). Build these with the MCP server in phase 4 (`docs/ARCHITECTURE.md` §7).
- **Wire the new agent components into the editor** (2026-10-30, reaffirmed 2026-11-06)
  - The 26 agent components live in the library and docs only. The editor's agent panel still uses the original thread parts.
  - Wire them component by component, following the "Choosing" rules in `docs/AGENT_UI.md`.
  - Already wired: CTA regions, the Notes Apply key, the suggestion chip, Send, and Export.
- **Remove the fixed label props** (2026-11-06)
  - `approveLabel`, `denyLabel` (ApprovalCard) and `action.label` (CitedAnswer) stay as aliases for one release, then go. Labels come from `tool`, `count`, `edits` and `cta`.
- **Promote the duplicated helpers** (2026-11-06)
  - Two helpers were written twice by the component builders:
    - The relative-time helper (`Ago`, in approval-card and agent-ledger).
    - The copy-to-check morph (in tool-call and message-actions).
  - Move each to the atoms the next time either file changes.

## Decided

### Design system
- **affectUI is the reference for agent-UI structure and motion, rebuilt in our materials, never copied, never named** (2026-11-06)
  - Same rule as Arc and assistant-ui.
  - A curated set of about 30 components adapted to video editing, not all 77.
- **"Live" is the graphite light face, never a new hue** (2026-11-06)
  - Rays and a sweep of light (`--live`, `--live-sheen`). Ink, red and blue keep their one meaning each.
- **Agent cards sit in a Tray** (2026-11-06)
  - A raised card in a shallow tray; the header and footer rows carry the meta and the actions (`src/ui/molecules/tray`).
- **Hanging tray** (2026-11-06)
  - Under the agent's byline, a tray steps out by `--tray-inset` (13px). Its header icon sits under the mark and its header text under the name.
  - Card content starts on the same 13px edge (`--tray-card-inset`). Text after a 14px icon lands on the name's edge.
  - Picked from five layouts.
- **Component names read as words in the docs** (2026-11-06)
  - "Agent checkpoints", not `AgentCheckpoints`. Code blocks and props keep identifiers; each page shows the import.
  - Done in one display layer, `docs-site/naming.ts`.
- **Docs group components by job** (2026-11-06)
  - Chat, Agent, Editing, Inputs, Feedback, Primitives, under one collapsible Components dropdown. The layer (atom, molecule, organism) is a tag.
- **No Workbench section in the docs** (2026-11-06)
  - Removed after the byline alignment was decided. Design specimens live on the relevant Foundations page instead (e.g. Actions).
- **Mono only for time** (2026-10-30)
  - Timecodes, durations and clocks. Never tool names, JSON or counts; arguments show as labelled rows.

### Calls to action
- **CTA labels are hybrid** (2026-11-06)
  - The agent may propose a label with any UI tool call.
  - The app shows it only when it passes `validate.ts`:
    - a verb first, naming the object;
    - 4 words or fewer;
    - counts that match what it touches;
    - no vague words.
  - Otherwise the app shows its own label from `derive.ts`, so a key is never missing or wrong.
- **One primary per surface, by election** (2026-11-06)
  - Regions (title bar, notes, agent panel, stage) elect one primary by intent: decide > run > review > apply > finish > navigate. Dismiss is never primary.
  - Ties: decisions go oldest first; everything else goes to the candidate that most recently appeared or became enabled.
  - Export (finish) waits while any decide or run is pending anywhere. The editor also holds it while a run is going.
  - Code: `src/ui/cta`, Foundations › Actions.
- **Stacked asks are answered oldest first** (2026-11-06)
  - When several agent asks wait on the panel at once (e.g. two Approval cards), the oldest holds the primary and the next one rises when it's answered. ⌘↵ answers whichever card has focus; it isn't a global shortcut.
  - Any other tie still goes to the newest, so Send beats a suggestion once you've typed (`src/ui/cta/elect.ts`, `breaksTie`).
  - Chosen over newest first, and over showing one ask at a time with the rest folded.
- **Play is transport, not a primary** (2026-11-06)
  - The round Play key in Lite is key material, not the light face, so it never competes with a surface's primary (`src/editor/Editor.tsx`, ScrubBar). Checked by eye in the editor.
- **A destructive primary takes a red face** (2026-11-06)
  - When a destructive action holds the primary ("Delete 3 takes", "Overwrite export"), the light face becomes red with white text (`src/ui/cta/cta-key.module.css`).
  - It's the only primary that takes a hue. Red already means recording and destructive, so it stays within the signals.
  - Chosen over a light face with a red label, and over a key with a red label.

### Development
- **On localhost the browser build opens a sample recording, as if it had just been captured** (2026-11-06)
  - The desktop app always starts by recording; the browser build skips that and loads `dev/sample/Sample recording` through the same `capture.lastFinished` → `projectFromRecording` path, so playback, zooms and agent edits act on a real clip.
  - The dev server serves it (`scripts/dev-recordings.ts`, serve only, with byte ranges for seeking). It's not in the built app. `?recording=latest`, a capture's name, or `none` picks another.
  - The sample is a made-up app drawn by `scripts/make-sample-recording.mjs`, so it holds nothing personal and can be regenerated.

### Agent
- **The agent is the user's Claude Code CLI over stream-json, acting only through our MCP tools** (2026-10-30)
  - `docs/ARCHITECTURE.md` §7.
- **The agent UI catalog is the single source for which component renders which moment of a run** (2026-11-06)
  - `src/ui/agent-ui/catalog.ts` generates `docs/AGENT_UI.md` (`npm run docs:agent-ui`) and feeds the docs' "In the stream" sections and the Agent harness page.
