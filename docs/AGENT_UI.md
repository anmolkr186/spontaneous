# Agent UI: which component for which moment

Generated from `src/ui/agent-ui/catalog.ts` by `npm run docs:agent-ui`. Don't edit by hand.

The agent is the Claude Code CLI streaming stream-json, acting only through our MCP tools (`mcp__spontaneous__*`). The harness turns that stream into thread parts and renders each part with the component below. Every component has a live page at `/docs.html#<id>` with its props, keyboard, accessibility and motion.

Triggers come from three places: **stream** (an event in Claude Code's output), **tool** (a call to one of our MCP tools; *proposed* tools are the contract this document asks the MCP server to add), and **app** (state the app owns).

## Choosing

Ask these in order; the first that matches wins.

| When | Use |
|---|---|
| Nothing has streamed yet after a send | Thinking loader; switch to Thinking state as soon as a thinking block or a read tool arrives |
| The agent is reading (thinking, get_project, get_input_events, render_frame) before its first edit | Thinking state, with each frame or input range it read as a moment |
| A run will make three or more edits | Agent plan first (propose_plan), then let the same card run |
| The agent calls a write tool that is reversible | Tool call inside a Tool call group; the edit lands in Agent ledger |
| The agent calls a write tool that is hard to undo (overwrite, delete, replace audio) | Approval card, unless Autonomy dial says it runs on its own |
| The agent needs a right it doesn't have (outside the project, network, a device) | Permission request |
| The agent can't decide between a few directions of taste | Ask card (ask_user) for 2–4 short options; Shot suggestion when it has a favorite shot |
| The agent wants to change words: captions, the script, on-screen text, the title | Inline diff (propose_text_edit), never a silent rewrite |
| The agent answers a question about the recording | Cited answer, citing the moments it looked at |
| The agent tries the same edit several ways | Parallel attempts (try_variants) |
| A run takes longer than about 20 seconds (render, export, a long batch of notes) | Agent monitor |
| The person types while a run is going | Agent steering: queue the note for the next step, ⌘↵ to apply now |
| The agent replied to a specific note | Note thread on that note; resolve_annotation links the edits |
| A turn ends | Message actions under the last text; Agent checkpoints saves a checkpoint if anything changed |
| Something finished outside the panel (export done, copy, background error) | Toaster |

## UI blocks (while the agent has no tools)

Until the MCP tools exist, the agent brings up a component by writing a fenced block in its reply: a line ````spontaneous <tool>````, one JSON object, and a closing fence. The app turns it into that tool's part (`src/editor/agent-stream.ts`), so the thread renders it exactly as it will render the real tool. The agent's system prompt is generated from the same table (`src-tauri/src/agent_prompt.txt`).

### `propose_plan`

Any change to the video: one or more edits. The person reviews, reorders and runs it; the app applies each step and tells you what landed.

```json
{"title":"Tighten the intro","estimate?":"~20s","steps":[{"id":"s1","title":"Zoom on the Create button","tool":"add_zoom","args":{"start":11.2,"end":16.6,"scale":1.8,"target":{"x":0.36,"y":0.84}}},{"id":"s2","title":"Call out the share link","tool":"add_overlay","args":{"kind":"callout","start":65,"end":68,"label":"Copy the link"}},{"id":"s3","title":"Open on Lid Rise","tool":"set_shot","args":{"shot":"lid-rise"}},{"id":"s4","title":"Calmer camera","tool":"set_motion","args":{"speed":0.8,"amount":0.6}},{"id":"s5","title":"Drop the auto zoom at 0:40","tool":"remove_zoom","args":{"start":40,"end":44}}],"cta?":{"primary":{"label":"Tighten the intro"}}}
```

Answer: {"action":"run","steps":[…in the person's order, maybe renamed or removed…]} then a summary of each step's result; or {"action":"cancel"}

### `ask_user`

A matter of taste you can't decide: one short question, 2–4 short options.

```json
{"question":"What pace should the launch cut have?","options":["Punchy, 20s","Walkthrough, 45s"]}
```

Answer: {"answer":"Punchy, 20s"}

### `suggest_shot`

You have a favorite shot for part of the video. First option is your pick; give a reason and a confidence of 1–3.

```json
{"context?":"0:00–0:06","options":[{"id":"lid-rise","label":"Lid Rise","reason":"The lid opens and the screen powers on: a strong opener.","confidence":3},{"id":"orbit-in","label":"Orbit In","reason":"A slow orbit settles on the screen.","confidence":2}],"cta?":{"primary":{"label":"Use Lid Rise first"}}}
```

Answer: {"used":"lid-rise"} (the app has already switched the shot) or {"undone":"lid-rise"}

### `propose_text_edit`

Changing words: an overlay's label, a note's text, the video title. The person accepts or rejects each change.

```json
{"target":"overlay:o2","label?":"Callout · Make it shorter","original":"Click here to create your first project","suggested":"Create your first project"}
```

Answer: {"text":"the final text, as decided"} (the app has already written it to the target)

### `answer_with_moments`

Answering a question about the recording: cite the moments each sentence rests on.

```json
{"segments":[{"text":"Trim the filler at the start.","cite":["m1"]},{"text":"Zoom in as you click Create.","cite":["m2","n2"],"paragraph?":false}],"moments":[{"id":"m1","at":0,"kind":"transcript","title":"Intro","quote?":"So, um, this is…","highlight?":["um"]},{"id":"m2","at":11.2,"kind":"click","title":"Click on Create"},{"id":"n2","at":12,"kind":"note","pin":2,"title":"zoom here"}],"edits?":2}
```

Answer: {"action":"apply"} when the person wants it as edits: reply with a propose_plan

### `request_approval`

Before something hard to undo that isn't a plain plan step. Plan steps are already approved by running the plan.

```json
{"title":"Replace the recording's audio with the cleaned track","description?":"Room hum removed","risk":"medium","tool?":"replace_audio","details?":[{"label":"Track","value":"Microphone"}]}
```

Answer: {"approved":true,"always":false} or {"approved":false}

### `request_permission`

You need a right you don't have, scoped once, for an hour, or always.

```json
{"action":"write to ~/Movies/Spontaneous","target?":"Files · ~/Movies/Spontaneous","risk":"risky","reason":"I'll save the export there.","preview?":[{"id":"f1","label":"Projects-demo.mp4","meta":"182 MB"}]}
```

Answer: {"allow":true,"scope":"once"} or {"allow":false}

### `try_variants`

You compared a few ways to do the same edit and want the person to pick. Score each 0–100; say what it does in one line.

```json
{"task":"Pace the intro","attempts":[{"id":"a1","name":"Tight cut","approach?":"Cut 6.4s of pauses","score":86,"note":"Cuts 6.4s · keeps the click"},{"id":"a2","name":"Speed ramp 2×","score":71,"note":"Saves 3.5s · typing reads rushed"}]}
```

Answer: {"picked":"a1"}: reply with a propose_plan for that one

### `reply_to_note`

Answering on one note, e.g. when a note asks you something with @agent.

```json
{"note":"n2","text":"Slowed the zoom in and held it a second longer.","status?":{"label":"Retimed the zoom","at":11,"end":17,"details":[["Ease in","0.6s"]]}}
```

Answer: none; it appears under the note

## Writing a CTA

Any UI tool call may carry `"cta": { "primary": { "label", "intent" }, "secondary": [{ "label" }] }`. The app shows your label when it passes these rules and its own derived label otherwise, so a key is never missing or wrong. Which key is primary on a surface is the app's call: one per surface, ranked by intent, and Export waits while any work or decision is pending.

- Start with a verb that says what happens: Apply, Run, Cut, Zoom, Replace, Allow, Accept, Use, Export. Never Confirm, OK, Yes, Submit, Continue.
- Name the object, and a count or a time when it helps: “Apply zoom at 0:12”, “Delete 3 takes”, “Run 5 edits”.
- Four words and 28 characters at most. Sentence case. No !, ?, … or emoji.
- A number must match what the action touches: “Apply 3 notes” only when there are 3.
- Destructive actions name what they destroy (“Overwrite export”, not “Overwrite”); the key turns red on its own.
- The intent ranks it: decide (approve, allow) > run (start work) > review (accept changes) > apply (take a suggestion) > finish (export) > navigate. Dismiss (Deny, Keep current, Cancel) is never primary. Several asks waiting: the oldest holds the primary, so they're answered in the order you made them.
- Leave the label out when the derived one already says it: the app writes “Run 5 edits”, “Accept 4 changes”, “Allow for an hour” itself.

| Intent | Good | Turned down |
|---|---|---|
| decide | Replace audio · Delete 3 takes · Allow for an hour | Confirm · OK · Yes, do it! |
| run | Run 5 edits · Apply zoom at 0:12 · Tighten the intro | Apply · Go · Start the whole thing now |
| review | Accept 4 changes · Keep the shorter one | Accept · Looks good 🎉 |
| apply | Use Lid Rise · Apply as 3 edits | Use it · Apply suggestion |
| finish | Export 1080p · Export for Slack | Done · Finish |

## At a glance

| Moment | Component | Import | Trigger |
|---|---|---|---|
| The gap between sending and the first streamed word or tool call. | Thinking loader (`ThinkingLoader`) | `@/ui/molecules/thinking-loader` | stream: message_start → first content_block_start |
| The agent reads the project and looks at frames before it edits anything. | Thinking state (`ThinkingState`) | `@/ui/organisms/thinking-state` | stream: thinking block, or tool_use of get_project / get_input_events / render_frame |
| Every call the agent makes to the editor, one line each, grouped per turn. | Tool call, Tool call group (`ToolCall, ToolCallGroup`) | `@/ui/molecules/tool-call` | stream: tool_use + tool_result for mcp__spontaneous__* |
| Before a run of three or more edits: the person reviews, reorders and starts it; the same card then runs. | Agent plan (`AgentPlan`) | `@/ui/organisms/agent-plan` | tool `propose_plan` (proposed) |
| The person types while a run is going, to change what happens next without stopping it. | Agent steering (`AgentSteering`) | `@/ui/organisms/agent-steering` | app: composer submit while a run is active |
| A long run the person keeps an eye on while doing other work: render, export, a big batch of notes. | Agent monitor (`AgentMonitor`) | `@/ui/organisms/agent-monitor` | app: a run passes ~20s, or an export/render job starts |
| The agent tries the same edit a few ways at once and lets the best win. | Parallel attempts (`ParallelAttempts`) | `@/ui/organisms/parallel-attempts` | tool `try_variants` (proposed) |
| The agent can't decide a matter of taste and asks one short question. | Ask card (`AskCard`) | `@/ui/organisms/agent` | tool `ask_user` (existing) |
| The agent is about to do something hard to undo and needs a yes first. | Approval card (`ApprovalCard`) | `@/ui/organisms/approval-card` | stream: permission prompt (--permission-prompt-tool stdio) for a destructive write tool |
| The agent needs a right it doesn't have: writing outside the project, reaching the network, a device. | Permission request (`PermissionRequest`) | `@/ui/organisms/permission-request` | tool `request_permission` (proposed) |
| Settings and first run: how much the agent may do without asking. | Autonomy dial (`AutonomyDial`) | `@/ui/organisms/autonomy-dial` | app: agent settings; first run of a project |
| Everything the agent changed in the project, each with Undo, honest about what can't be undone. | Agent ledger (`AgentLedger`) | `@/ui/organisms/agent-ledger` | app: command log: every write tool result with an undo record |
| Versions of the edit: a checkpoint after each applied note or plan step; rewind to try again from any of them. | Agent checkpoints (`AgentCheckpoints`) | `@/ui/organisms/agent-checkpoints` | app: checkpoint saved after resolve_annotation or a plan step |
| The agent wants to change words: captions, the narration script, on-screen text, the title. | Inline diff (`InlineDiff`) | `@/ui/organisms/inline-diff` | tool `propose_text_edit` (proposed) |
| The agent answers on a specific note: what it did for it, or a reply to @agent. | Note thread (`NoteThread`) | `@/ui/organisms/note-thread` | tool `resolve_annotation (existing) · reply_to_note (proposed)` |
| Under the agent's last text when a turn ends: copy, another version, rate it, preview the changed stretch. | Message actions, Message text (`MessageActions, MessageText`) | `@/ui/molecules/message-actions` | stream: result (turn end) |
| The agent answers a question about the recording and shows the moments it rests on. | Cited answer (`CitedAnswer`) | `@/ui/organisms/cited-answer` | tool `answer_with_moments` (proposed) |
| The agent has a favorite shot for part of the video, with a reason and a way out. | Shot suggestion (`ShotSuggestion`) | `@/ui/molecules/shot-suggestion` | tool `suggest_shot` (proposed) |
| The conversation itself: every surface above renders inside it as a message part. | Agent thread (`AgentThread`) | `@/ui/organisms/agent` | stream: all stream-json events, converted to thread parts |
| Where the person tells the agent what to change, with frames, regions and notes attached. | Chat composer (`ChatComposer`) | `@/ui/organisms/chat-composer` | app: always present under the thread |
| Choosing which model edits and whether it thinks first. | Model picker (`ModelPicker`) | `@/ui/molecules/model-picker` | stream: system init (model) · app setting |
| What fills the agent's context: prompt, tools, project outline, transcript, notes, frames, conversation. | Context window (`ContextWindow`) | `@/ui/organisms/context-window` | app: usage after each turn (result.usage) and the harness's own accounting per part |
| ⌘K: run any edit, or hand what was typed to the agent. | Command menu (`CommandMenu`) | `@/ui/organisms/command-menu` | app: ⌘K |
| Bringing recordings, b-roll and audio into the project. | Dropzone (`Dropzone`) | `@/ui/organisms/dropzone` | app: import |
| Something finished outside the panel: an export, a copy, an error the person should hear about. | Toaster, Toast (`Toaster, toast`) | `@/ui/organisms/toaster` | app: job finished · copy · background error |
| A new project's first steps: record, note, apply with the agent, pick a shot, export. | Getting started (`GettingStarted`) | `@/ui/molecules/getting-started` | app: new project |

## While it thinks

### Thinking loader

`import { ThinkingLoader } from "@/ui/molecules/thinking-loader"` · docs: `/docs.html#thinking-loader`

The gap between sending and the first streamed word or tool call.

- **Trigger:** stream: message_start → first content_block_start
- **You say:** “Zoom on the Create button and slow the click down a little.”
- **Agent says:** “(nothing yet: the loader speaks for it) Reading the project → Looking at the frame → Planning the edit → Applying edits”
- **Props:** phase = index of the latest stream milestone; done = the first text delta arrived.

- **Instead:** Use Thinking state once there is a thinking block or a read tool to show.

```js
{ "type": "stream_event", "event": { "type": "message_start" } }
// phase 1 on the first tool_use, 2 when its result arrives, 3 on the first text delta
```

### Thinking state

`import { ThinkingState } from "@/ui/organisms/thinking-state"` · docs: `/docs.html#thinking-state`

The agent reads the project and looks at frames before it edits anything.

- **Trigger:** stream: thinking block, or tool_use of get_project / get_input_events / render_frame
- **You say:** “Tighten the start: zoom on Create and drop the dead air.”
- **Agent says:** “Let me find the click on Create and any pauses in the first fifteen seconds before I change anything.”
- **Props:** steps = one per thinking block or read tool (label from the tool's doing-label); moments = render_frame times and input-event ranges; done when the first write tool starts.

- **Instead:** Short waits with nothing to show: Thinking loader.

```js
{ "type": "tool_use", "name": "mcp__spontaneous__render_frame", "input": { "t": 12.4 } }
{ "type": "tool_use", "name": "mcp__spontaneous__get_input_events", "input": { "from": 9, "to": 17, "kinds": ["click"] } }
```

## While it works

### Tool call, Tool call group

`import { ToolCall, ToolCallGroup } from "@/ui/molecules/tool-call"` · docs: `/docs.html#tool-call`

Every call the agent makes to the editor, one line each, grouped per turn.

- **Trigger:** stream: tool_use + tool_result for mcp__spontaneous__*
- **You say:** “Zoom on the Create button and cut the dead air before the share dialog.”
- **Agent says:** “Zooming to 1.8× on Create while you click it, then cutting the pause at 0:58.”
- **Props:** name = tool name without the mcp prefix; args = input; status running until the result, failed when is_error; result = content; startedAt from the tool_use timestamp. Consecutive calls share one ToolCallGroup.

- **Instead:** A run that was planned: let Agent plan show progress and keep the tool calls collapsed in its group.

```js
{ "type": "tool_use", "id": "tu_2", "name": "mcp__spontaneous__add_zoom", "input": { "start": 11.2, "end": 16.6, "scale": 1.8, "target": { "x": 0.36, "y": 0.84 } } }
{ "type": "tool_result", "tool_use_id": "tu_2", "content": { "id": "z9", "undo": { "kind": "remove", "id": "z9" } } }
```

### Agent plan

`import { AgentPlan } from "@/ui/organisms/agent-plan"` · docs: `/docs.html#agent-plan`

Before a run of three or more edits: the person reviews, reorders and starts it; the same card then runs.

- **Trigger:** tool `propose_plan` (proposed)
- **You say:** “Tighten the Projects walkthrough. It drags in the middle.”
- **Agent says:** “Here is what I'd change. Edit anything before I run it.”
- **Props:** steps from the call; status draft until Run plan resolves the tool call; then a step is running from its first tool_use with that step id and done at its last result; failed carries the error; onRetry re-sends from that step.
- **Keys:** Primary: Run 5 edits (run; derived from the step count, or the agent's cta). Secondary: Cancel. Failed: Retry from step 3 (run). Done: Run again (secondary).

- **Instead:** One or two edits: just do them (Tool call). A single risky action: Approval card.

```js
propose_plan({
  "title": "Tighten the Projects walkthrough",
  "estimate": "~40s",
  "cta": { "primary": { "label": "Tighten the walkthrough", "intent": "run" } },
  "steps": [
    { "id": "s1", "title": "Cut the dead air after the form", "tool": "cut", "from": 42, "to": 51 },
    { "id": "s2", "title": "Speed up the typing to 2×", "tool": "set_speed", "from": 20, "to": 31 },
    { "id": "s3", "title": "Zoom on the Create button", "tool": "add_zoom", "from": 12 }
  ]
})
// → returns the steps in the person's order; each later write call carries "step": "s2"
```

### Agent steering

`import { AgentSteering } from "@/ui/organisms/agent-steering"` · docs: `/docs.html#agent-steering`

The person types while a run is going, to change what happens next without stopping it.

- **Trigger:** app: composer submit while a run is active
- **You say:** “(mid-run) Make the typing 2×, not 3×.”
- **Agent says:** “Picking up your note on the typing step: 2× instead of 3×.”
- **Props:** steps mirror the plan (done/active/pending); queue = notes not yet sent; a note moves into a step's notes when the agent's next text mentions taking it, or when its step starts.

- **Instead:** Before the run starts: edit the Agent plan instead.

```js
// Enter: queued, sent as a user message when the current step ends
{ "type": "user", "message": { "role": "user", "content": "Steering note for step s2: Make the typing 2×, not 3×." } }
// ⌘Enter: sent now, as an interrupt
```

### Agent monitor

`import { AgentMonitor } from "@/ui/organisms/agent-monitor"` · docs: `/docs.html#agent-monitor`

A long run the person keeps an eye on while doing other work: render, export, a big batch of notes.

- **Trigger:** app: a run passes ~20s, or an export/render job starts
- **You say:** “Apply the edits and export the Projects walkthrough. I'll be in Figma.”
- **Agent says:** “Applying the seven edits, then rendering at 1080p. I'll stop and ask before writing over the old export.”
- **Props:** state from the run (running, waiting when a permission prompt is pending, finished, failed); steps from finished tool calls; cost from result.total_cost_usd so far; ask from a pending approval.
- **Keys:** Primary while it asks: the tool's verb, e.g. Overwrite export (decide). Secondary: Decline, Pause, Cancel.

- **Instead:** Short runs: the Tool call group is enough.

```js
{ "job": "export", "state": "running", "step": { "label": "Render at 1080p", "kind": "render", "since": 1730900000000 }, "cost": 0.15 }
```

### Parallel attempts

`import { ParallelAttempts } from "@/ui/organisms/parallel-attempts"` · docs: `/docs.html#parallel-attempts`

The agent tries the same edit a few ways at once and lets the best win.

- **Trigger:** tool `try_variants` (proposed)
- **You say:** “The intro feels slow. Try a few ways to pace it and keep the best.”
- **Agent says:** “Trying three ways to pace the intro: a tight cut, a 2× speed ramp, and a zoom with a callout. I'll keep the best one.”
- **Props:** attempts with status/progress/step from the events; score and note on done; picked = the best unless the person picks another; onPick applies that variant's edits.

- **Instead:** One approach: just run it.

```js
try_variants({
  "task": "Pace the intro",
  "attempts": [
    { "id": "a1", "name": "Tight cut", "model": "Claude Opus" },
    { "id": "a2", "name": "Speed ramp 2×", "model": "Claude Sonnet" },
    { "id": "a3", "name": "Zoom + callout", "model": "Claude Haiku" }
  ]
})
// progress events: { "attempt": "a2", "progress": 0.6, "step": "Ramping the typing" }
// done: { "attempt": "a2", "score": 71, "note": "Saves 3.5s · the typing reads rushed" }
```

## Before it acts

### Ask card

`import { AskCard } from "@/ui/organisms/agent"` · docs: `/docs.html#ask`

The agent can't decide a matter of taste and asks one short question.

- **Trigger:** tool `ask_user` (existing)
- **You say:** “Make a launch cut from this.”
- **Agent says:** “Before I cut it down: how long should it feel?”
- **Props:** question and 2–4 options; the answer goes back as the tool result.
- **Keys:** No primary: every option is equal, so they stay keys with number caps.

- **Instead:** It has a favorite and a reason: Shot suggestion. It's about to do something risky: Approval card.

```js
ask_user({ "question": "What pace should the launch cut have?", "options": ["Punchy, 20s", "Walkthrough, 45s", "Feature trio, 3×10s"] })
```

### Approval card

`import { ApprovalCard } from "@/ui/organisms/approval-card"` · docs: `/docs.html#approval-card`

The agent is about to do something hard to undo and needs a yes first.

- **Trigger:** stream: permission prompt (--permission-prompt-tool stdio) for a destructive write tool
- **You say:** “Clean up the narration and drop the takes I didn't use.”
- **Agent says:** “The cleaned track is ready. Replacing the recording's audio needs your OK.”
- **Props:** title from the tool's action label; details from the input (times in the time face); risk from the tool's class; onApprove/onDeny answer the prompt over stdin; Always allow pins it in autonomy-dial.
- **Keys:** Primary: the tool's own verb and object, e.g. Replace audio (decide; red when the risk is high). Secondary: Keep current (dismiss) and Edit.

- **Instead:** A right the agent doesn't have at all: Permission request. Reversible edits: run them and offer Undo.

```js
{ "type": "permission_request", "tool": "mcp__spontaneous__replace_audio",
  "input": { "track": "Microphone", "length": 134, "changes": "Hum removed, peaks down 3 dB" },
  "risk": "medium", "expiresIn": 60,
  "cta": { "primary": { "label": "Replace audio", "intent": "decide" }, "secondary": [{ "label": "Keep current" }] } }
```

### Permission request

`import { PermissionRequest } from "@/ui/organisms/permission-request"` · docs: `/docs.html#permission-request`

The agent needs a right it doesn't have: writing outside the project, reaching the network, a device.

- **Trigger:** tool `request_permission` (proposed)
- **You say:** “Export the Projects demo and put it in my Movies folder.”
- **Agent says:** “I need to write to ~/Movies/Spontaneous to save the export there.”
- **Props:** agent, action, target, risk, reason, preview straight from the call; scopes once / for an hour / always; the decision returns as the tool result and is remembered by the app.
- **Keys:** Primary: Allow once / Allow for an hour / Always allow, following the scope switch (decide). Secondary: Deny.

- **Instead:** Approving one specific action inside rights it already has: Approval card.

```js
request_permission({
  "action": "write to ~/Movies/Spontaneous", "target": "Files · ~/Movies/Spontaneous", "risk": "risky",
  "reason": "The export is ready. I'll write the video, its captions and a poster frame there.",
  "cta": { "primary": { "label": "Allow saving here", "intent": "decide" } },
  "preview": [ { "label": "Projects-demo.mp4", "meta": "182 MB" }, { "label": "Projects-demo.srt", "meta": "4 KB" } ]
})
```

### Autonomy dial

`import { AutonomyDial } from "@/ui/organisms/autonomy-dial"` · docs: `/docs.html#autonomy-dial`

Settings and first run: how much the agent may do without asking.

- **Trigger:** app: agent settings; first run of a project
- **Agent says:** “(not triggered by the agent) The harness reads the level before every write tool to decide between running it and an approval-card.”
- **Props:** actions = the write tools with their risk class; level 0 always ask, 1 ask if risky, 2 full auto; pinned = tools that always ask.

## What it changed

### Agent ledger

`import { AgentLedger } from "@/ui/organisms/agent-ledger"` · docs: `/docs.html#agent-ledger`

Everything the agent changed in the project, each with Undo, honest about what can't be undone.

- **Trigger:** app: command log: every write tool result with an undo record
- **You say:** “What did you change?”
- **Agent says:** “Here's everything I changed this session. Undo any of it; the export and the Slack post can't be taken back.”
- **Props:** entries from the command log; reversible false for exports and uploads; dependsOn from edits built on earlier ones; onUndo/onRedo run the undo records.

```js
{ "id": "c7", "action": "Zoom", "target": "Create button", "position": 12, "change": ["1.4×", "1.8×"], "at": 1730900040000, "dependsOn": ["c5"] }
```

### Agent checkpoints

`import { AgentCheckpoints } from "@/ui/organisms/agent-checkpoints"` · docs: `/docs.html#agent-checkpoints`

Versions of the edit: a checkpoint after each applied note or plan step; rewind to try again from any of them.

- **Trigger:** app: checkpoint saved after resolve_annotation or a plan step
- **You say:** “The zoom on Create is too strong now. Go back to before the callout and try a gentler one.”
- **Agent says:** “Rewinding to “Zoom on Create” and trying a gentler zoom from there. The current version stays one click away.”
- **Props:** checkpoints in order with parent links; head = the version on screen; onRewind restores it and starts a new attempt from it.

```js
{ "checkpoint": { "id": "k5", "title": "Speed up typing", "parent": "k4", "at": 70, "edits": 1 } }
```

### Inline diff

`import { InlineDiff } from "@/ui/organisms/inline-diff"` · docs: `/docs.html#inline-diff`

The agent wants to change words: captions, the narration script, on-screen text, the title.

- **Trigger:** tool `propose_text_edit` (proposed)
- **You say:** “Tighten the captions for the first shot, drop the filler words.”
- **Agent says:** “I trimmed the filler from the first shot's captions. Accept or reject each change.”
- **Props:** original and suggested (or precomputed changes); label from target and the ask; onDone returns the final text as the tool result.
- **Keys:** Primary: Accept 4 changes (review; the count rolls as you decide). Secondary: Reject all; per change Accept (Y) and Reject (N).

- **Instead:** Edits to the timeline itself: Tool call, never a text diff.

```js
propose_text_edit({
  "target": "captions", "from": 0, "to": 14, "label": "Captions · Make it shorter",
  "original": "So, um, this is the Projects page. And here you just, uh, click the Create button…",
  "suggested": "This is the Projects page. Click the Create button…",
  "cta": { "primary": { "label": "Keep the shorter one", "intent": "review" } }
})
// → returns the text as decided, change by change
```

### Note thread

`import { NoteThread } from "@/ui/organisms/note-thread"` · docs: `/docs.html#note-thread`

The agent answers on a specific note: what it did for it, or a reply to @agent.

- **Trigger:** tool `resolve_annotation (existing) · reply_to_note (proposed)`
- **You say:** “(on note 2) @agent make it slower”
- **Agent says:** “Slowed the zoom in and held it a second longer, so the dialog has time to land.”
- **Props:** messages from the note's history; the agent's reply carries status with its edit details; thinking while the reply streams.

```js
reply_to_note({ "note": "n2", "text": "Slowed the zoom in and held it a second longer…",
  "status": { "label": "Retimed the zoom", "at": 11, "end": 17, "details": [["Ease in", "0.6s"], ["Hold", "1.2s"]] } })
```

### Message actions, Message text

`import { MessageActions, MessageText } from "@/ui/molecules/message-actions"` · docs: `/docs.html#message-actions`

Under the agent's last text when a turn ends: copy, another version, rate it, preview the changed stretch.

- **Trigger:** stream: result (turn end)
- **Agent says:** “Zoomed to 1.6× on the Create button for the click at 0:13, and cut the pause at 0:58.”
- **Props:** text = the turn's final text; versions grow with each regenerate; onPreview plays the time range the turn touched; onFeedback is logged locally.
- **Keys:** No primary: the bar is quiet tertiary keys.

- **Instead:** While it streams: no bar; show Stop in the composer.

```js
{ "type": "result", "subtype": "success", "duration_ms": 9400, "total_cost_usd": 0.04 }
```

## Answers and suggestions

### Cited answer

`import { CitedAnswer } from "@/ui/organisms/cited-answer"` · docs: `/docs.html#cited-answer`

The agent answers a question about the recording and shows the moments it rests on.

- **Trigger:** tool `answer_with_moments` (proposed)
- **You say:** “What should change in the first fifteen seconds?”
- **Agent says:** “Trim the filler at the start [0:00]. Then zoom in on the Create button as you click it [0:11][note 2]; it's small and hard to read on a phone.”
- **Props:** segments and moments from the call; streaming while text deltas arrive; onSeek moves the playhead; action "Apply as edits" starts a plan.
- **Keys:** Primary: Apply as 3 edits (apply; held while it streams). Secondary: Go to 0:12 in the preview.

- **Instead:** A plain reply with no claims about the recording: text in the thread.

```js
answer_with_moments({
  "cta": { "primary": { "label": "Apply as 2 edits", "intent": "apply" } },
  "segments": [ { "text": "Trim the filler at the start.", "cite": ["m1"] }, { "text": "Then zoom in on the Create button as you click it.", "cite": ["m2", "n2"] } ],
  "moments": [ { "id": "m1", "at": 0, "kind": "transcript", "quote": "So, um, this is…", "highlight": ["um"] },
               { "id": "m2", "at": 11.2, "kind": "click", "title": "Click on Create" },
               { "id": "n2", "at": 12, "kind": "note", "pin": 2, "title": "zoom here, it's too small" } ]
})
```

### Shot suggestion

`import { ShotSuggestion } from "@/ui/molecules/shot-suggestion"` · docs: `/docs.html#shot-suggestion`

The agent has a favorite shot for part of the video, with a reason and a way out.

- **Trigger:** tool `suggest_shot` (proposed)
- **You say:** “The start feels static. Make it feel more like a launch.”
- **Agent says:** “I'd open on Lid Rise: the screen powers on, a strong opener for a launch.”
- **Props:** options in order (first is the pick); onAccept applies set_template; onUndo reverts it.
- **Keys:** Primary: Use Lid Rise (apply; follows the option on show). Secondary: Other options, then Undo.

- **Instead:** No clear favorite: Ask card (ask_user) with the options side by side.

```js
suggest_shot({ "context": "0:00–0:06", "cta": { "primary": { "label": "Use Lid Rise first", "intent": "apply" } }, "options": [
  { "id": "lid-rise", "label": "Lid Rise", "reason": "The lid opens and the screen powers on…", "confidence": 2 },
  { "id": "orbit-in", "label": "Orbit In", "reason": "A slow orbit settles on the screen…", "confidence": 1 } ] })
```

## Around the run

### Agent thread

`import { AgentThread } from "@/ui/organisms/agent"` · docs: `/docs.html#agent-thread`

The conversation itself: every surface above renders inside it as a message part.

- **Trigger:** stream: all stream-json events, converted to thread parts
- **Agent says:** “(container) Text deltas become text parts, thinking becomes reasoning, tool_use becomes tool parts rendered by this catalog.”
- **Props:** tools = { by_name: { ask_user: AskCard, propose_plan: AgentPlan, propose_text_edit: InlineDiff, … } }; anything unlisted falls back to ToolCall.
- **Keys:** Suggestion chips with an intent compete for the panel's primary: Apply 2 notes (run) rises to the light face when nothing else is waiting.

### Chat composer

`import { ChatComposer } from "@/ui/organisms/chat-composer"` · docs: `/docs.html#chat-composer`

Where the person tells the agent what to change, with frames, regions and notes attached.

- **Trigger:** app: always present under the thread
- **You say:** “Cut the pause before the share dialog [frame 0:12] [note 2]”
- **Agent says:** “(input) Attachments go to the agent as context: a frame as render_frame(t), a note by id.”
- **Props:** onSend(text, { attachments, model }); running shows Stop; transcript from local dictation.
- **Keys:** Send is the panel's run action: primary once there's text, secondary while a decision waits elsewhere on the panel.

### Model picker

`import { ModelPicker } from "@/ui/molecules/model-picker"` · docs: `/docs.html#model-picker`

Choosing which model edits and whether it thinks first.

- **Trigger:** stream: system init (model) · app setting
- **Agent says:** “(not triggered by the agent) The chosen model and effort are passed as --model and the thinking budget on the next run.”
- **Props:** value from init.model; onChange restarts the agent with the new model on the next turn.

```js
{ "type": "system", "subtype": "init", "model": "claude-sonnet-5-5" }
```

### Context window

`import { ContextWindow } from "@/ui/organisms/context-window"` · docs: `/docs.html#context-window`

What fills the agent's context: prompt, tools, project outline, transcript, notes, frames, conversation.

- **Trigger:** app: usage after each turn (result.usage) and the harness's own accounting per part
- **You say:** “Why is it getting slow?”
- **Agent says:** “The conversation is most of my context now. Compacting it keeps your notes and the project outline.”
- **Props:** parts with tokens; items for frames the agent looked at (removable); onCompact sends /compact; limit from the model.

```js
{ "usage": { "input_tokens": 48200, "cache_read_input_tokens": 31000 }, "parts": { "frames": ["0:12", "1:05"], "conversation": 19800 } }
```

### Command menu

`import { CommandMenu } from "@/ui/organisms/command-menu"` · docs: `/docs.html#command-menu`

⌘K: run any edit, or hand what was typed to the agent.

- **Trigger:** app: ⌘K
- **You say:** “slower zoom on create”
- **Agent says:** “(the fallback row) Ask the agent: slower zoom on create”
- **Props:** groups of editor commands; onRun("ask", query) sends the query to the agent as a message.

### Dropzone

`import { Dropzone } from "@/ui/organisms/dropzone"` · docs: `/docs.html#dropzone`

Bringing recordings, b-roll and audio into the project.

- **Trigger:** app: import
- **Agent says:** “(not triggered by the agent) Imported files reach the agent through get_project.”
- **Props:** onUpload copies the file into the package and reports progress.

### Toaster, Toast

`import { Toaster, toast } from "@/ui/organisms/toaster"` · docs: `/docs.html#toaster`

Something finished outside the panel: an export, a copy, an error the person should hear about.

- **Trigger:** app: job finished · copy · background error
- **Agent says:** “Exported Projects-demo.mp4.”
- **Props:** toast(title, { description, action }) or toast.promise for jobs.

- **Instead:** Anything that needs a decision: Approval card or Permission request, in the thread.

```js
toast.promise(exportJob, { loading: "Exporting 1080p…", success: "Exported Projects-demo.mp4", error: "Couldn't export" })
```

### Getting started

`import { GettingStarted } from "@/ui/molecules/getting-started"` · docs: `/docs.html#getting-started`

A new project's first steps: record, note, apply with the agent, pick a shot, export.

- **Trigger:** app: new project
- **Agent says:** “(not triggered by the agent) A step ticks when its first event happens: the first note, the first agent run, the first export.”
- **Props:** steps with done flags driven by project events.

