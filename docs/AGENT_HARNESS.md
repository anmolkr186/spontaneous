# Agent harness: token-lean screen recordings

How the editing agent should see a recording, and what the Mac should do before the agent sees anything. Written 2026-11-06 after auditing 30 days of Claude Code sessions and testing Apple's Vision framework on a real Spontaneous recording.

The short version: **the agent should read a digest, not the video.** Spontaneous already records clicks, cursor and focus as data. Add on-device text recognition, step detection and transcription after recording, and the agent can edit from a few thousand tokens however long the recording is. Reading the frames costs about 290k tokens a minute.

**Scope.** Any screen recording, web or mobile. Most will be product demos: a walkthrough of a flow, a feature tour, a tutorial, a bug repro. A launch teaser is one kind of output among several. The digest and tools are the same for all of them; only the edit intent changes (§2, "Intents").

### What a demo recording looks like

Demos differ from launch footage in ways that change the harness:

- **Longer.** Typically 1–10 minutes of raw footage, against 10–60 s for a launch clip. Anything that scales with seconds becomes unaffordable. 5 minutes at 1 fps is 300 frames ≈ 1.4M tokens, more than the context window.
- **Mostly dead time.** Waiting for loads, hunting for the next click, retyping a typo, idle cursor. Most of the editing is cutting and speeding up, which is decided from timing data, not pixels.
- **Structured as steps.** "Open settings → create a key → paste it → see it work." Clicks, focus changes, URL and window changes mark the step boundaries.
- **Often narrated.** A voiceover or mic track says what each step is for. The transcript is the cheapest and best description of the video.
- **Typing and scrolling.** Long typing bursts get sped up or replaced by a keystroke overlay. Scrolls get smoothed or cut.

---

## 1. Why this matters here

The agent runs on the user's own Claude plan, so every token comes out of their usage limit, not ours. Two facts set the budget:

- **Images are expensive on current models.** Opus 5.5 is in Anthropic's high-resolution tier: long edge up to 2,576 px, up to 4,784 visual tokens per image (about `w × h / 750`). A 3024×1898 Retina frame hits that cap. Older models capped at about 1,600.
- **Context is paid again every turn.** Anything in the thread is re-read on each later call. Cache reads are cheaper, but they still fill the window and count against limits. A frame the agent glanced at once on turn 3 is still being paid for on turn 40.

### What the audit found

Last 30 days, 231 sessions, about 11 billion input-side tokens (mostly cache reads). Ranked by "carried" tokens, meaning tokens added × later turns that re-read them. That's an upper bound, because it ignores compaction.

| What was read | Times | Tokens added | Carried |
|---|---|---|---|
| `grep` output | 9,136 | 3.6M | 2.4B |
| Browser screenshots (batch) | 2,325 | 2.0M (2,543 images) | 1.6B |
| iOS Simulator screenshots | 1,165 | 0.8M (505 images) | 1.0B |
| `sed -n` file slices | 1,263 | 1.0M | 0.8B |
| `cat` whole files | 1,499 | 1.3M | 0.7B |

Images across all sources (browser, simulator, Figma, `Read` of PNGs, pasted screenshots): about 7,700 images. The audit priced them at the older 1,568 px tier, so on Opus 5.5 the real cost is up to 3× higher.

In the Spontaneous sessions, contact sheets were already used (41 of 69 `ffmpeg` calls). That's the right instinct, but at 480 px per tile the text can't be read, so the agent then reads full frames anyway.

### What the local prep measured

Test recording: `Recording Oct 31 at 05.21` (8 s, 3024×1898, window capture), on an M1 Pro.

| | Tokens | Time |
|---|---|---|
| Before: 8 frames at 1 fps, full Retina | 8 × 4,784 ≈ **38,300** | — |
| After: digest (1 shot, 23 text lines with boxes, input summary) | ≈ **300** | Vision 0.25 s/frame warm (first run loads the model, about 60 s) |
| After: one 4×2 contact sheet, 1932×606 | ≈ **1,560** | ffmpeg < 1 s |
| **After, total** | **≈ 1,900 (−95%)** | |

All 8 frames were the same screen. Reading them one by one would have cost 38k tokens and added nothing.

A second test, on the Instagram reel this plan started from (71 s, 720×1280, narrated, with on-screen text):

| | Tokens | Time |
|---|---|---|
| Before: 71 frames at 1 fps (≈1,229 each) | ≈ **87,000** | — |
| After: `SpeechAnalyzer` transcript, 18 timed lines | ≈ **380** | **2.6 s**, no install, no model download |
| After: Vision OCR every 3 s, new lines only | ≈ **1,500** | ~5 s |
| **After, total** (no images read) | **≈ 1,900 (−98%)** | |

The reel's own claim is about 50k → 3k tokens per video under 2 minutes. That's consistent with ~1.2k tokens per vertical 720p frame. Retina screen recordings cost up to 4× more per frame, so the saving here is larger.

---

## 2. The harness: three layers

```
capture time (free)          after recording (free, seconds)        agent (paid)
──────────────────           ─────────────────────────────          ────────────
clicks, moves, keys     ─┐   shots       feature-print distance  ─┐  digest.md   ~3–5k / min
focus (AX)               ├─► text        Vision OCR, keyframes   ├─► sheet.jpg  1 image
element under click (AX) │   attention   Vision saliency         │  tools that take
window titles, URL      ─┘   speech      SpeechAnalyzer          │  semantic targets
                             PII         OCR + NSDataDetector     │  and return deltas
                             auto-zoom   planner (crates/motion) ─┘  pixels on request only
```

### Layer 1: record meaning at capture time

This is the cheapest layer and the best one. When a click happens, ask Accessibility what was clicked (`AXUIElementCopyElementAtPosition`): role, title, frame. A click becomes `{t: 2.31, role: "button", title: "Export", rect: [...]}` with no OCR, no pixels and no guesswork. Focus changes and window titles come from the same place. Input Monitoring and Accessibility are already in the permission list.

**Built (step 1, `crates/capture/src/ax.rs`).** Click-downs in `clicks.jsonl` carry `target: {role, label, frame}`, and `focus.jsonl` gets a line whenever the frontmost app, window, page URL or focused control changes (polled at 5 Hz). Tested on an M1 Pro:

- Lookups average 1–5 ms; a cold first lookup ~40–60 ms. They run on the writer thread, never in the event tap.
- Resolved correctly: buttons, menu bar items, windows, web page text in Safari, and Safari's window title + URL (`https://example.com/`) from the page's web area.
- The system-wide "focused application" query fails with "cannot complete" (−25204) for some apps, including Electron ones, so focus falls back to the owner of the frontmost on-screen window.
- Some apps wrap names in invisible direction marks; labels are cleaned and capped at 80 characters.
- Not verified live yet: a click on a web link resolving to `link "…"` (the walk-up from the link's text is in place).

**Privacy.** Accessibility labels are whatever text is on screen, so clicking a chat message records the message. That's no more than the video already shows, but labels reach the agent, so the PII pass in layer 2 must run over AX labels and focus titles too, not only OCR. Typed text is never recorded: text field values are skipped.

### Layer 2: local analysis after recording

Runs in Rust (or a small Swift helper bundled in the app), writes `cache/digest.json` and `cache/sheet.jpg`. Use AVFoundation inside the app, not Homebrew ffmpeg, which users won't have.

| Job | Apple API | Output for the agent |
|---|---|---|
| Find steps | Input tracks: clicks, focus, URL/window title changes, plus narration pauses | Step list with a title from the AX element or narration: "Create API key" |
| Find shots | `AVAssetImageGenerator` at 2 fps + `VNGenerateImageFeaturePrintRequest` distance | Shot list: start, end, keyframe |
| Dead time | Frame difference (vImage) + idle cursor + no input + no speech; loading spinners via saliency/OCR ("Loading…") | Ranges tagged `idle`, `loading`, `hunting` (cursor moving, no click), with suggested cut or speed |
| Typing and scrolling | `keys.jsonl`, `scrolls.jsonl` | Bursts: "typed 84 chars into Title, 0:31–0:44", scroll spans with distance |
| Read the screen | `VNRecognizeTextRequest` on shot keyframes only | Text lines with normalized boxes, only what's new since the last shot |
| Where the eye goes | `VNGenerateAttentionBasedSaliencyImageRequest` | 1–2 focus rects per shot (zoom candidates) |
| Sensitive data | OCR text through `NSDataDetector` (emails, phones, links) + key-shaped regex; `VNDetectFaceRectanglesRequest` | Proposed blur rects |
| Narration, voice notes | `SpeechAnalyzer` / `SpeechTranscriber` (macOS 26+) | Word-timed transcript, split into sentences and attached to steps. Ums, restarts and long pauses flagged as cut candidates. About 2× faster than Whisper Large V3 Turbo in early tests; accuracy similar to mid-size Whisper |
| Loudness and pace | EBU R128 loudness via Accelerate; words per minute from the transcript | Integrated LUFS against a target (−16 web, −14 social), speech rate per step. Steps with fast narration don't get sped up |
| Opening | First narration sentence + first 2 s of the current cut | "Opening line" in L0 and an optional hook frame |
| Music beats (only when music is added) | Accelerate `vDSP` onset / spectral flux | Beat grid in seconds |
| Webcam cutout (extended) | `VNGeneratePersonSegmentationRequest` | Not for the agent: a render-time mask for the webcam bubble. The reel cuts out a 71 s face track in about 4 s |
| Auto-zoom | `crates/motion` planner (already designed) | Zooms marked `source: "auto"` |

The on-device Foundation Models LLM is not worth it here. Its context is small (4K tokens on macOS 26, reportedly larger since), and the digest is already structured. Only use it if a voice note needs tidying before it reaches Claude.

Two lessons from the prototype:
- **Don't dedupe shots by exact OCR text.** OCR jitters between identical frames ("0:02" vs "D:02"). Use feature-print distance, or text-set overlap above 0.6.
- **Scene-change detection alone misses UI changes.** A dropdown opening is a small pixel change but a big meaning change. Split shots on clicks and focus events as well as on visual distance.
- **Mobile recordings have less to go on.** The iOS Simulator exposes some Accessibility data; a mirrored or USB iPhone exposes none. There, steps come from taps (pixel diff + touch indicators) and OCR, so expect a somewhat larger digest.

### Layer 3: what the agent gets

**A layered digest, so cost doesn't grow with length.** A flat digest runs about 3–5k tokens per minute, which is fine for a 30 s clip and too much for an 8-minute demo. So it comes in three zoom levels, and the agent drills down only where a note or edit needs it:

| Level | Content | Size |
|---|---|---|
| **L0 outline** (always in context) | Steps with titles and times, dead-time totals, narration summary per step, open notes, PII flags | ~40–80 tokens per step; **≤ 3k for any length** |
| **L1 step** (`get_digest(step)`) | Shots, clicks with AX labels, typing/scroll bursts, new OCR text, narration sentences | ~300–800 per step |
| **L2 pixels** (`look`, `sheet`) | A crop or contact sheet | ≤ 800 / ≤ 1,600 per call, budgeted |

L0 for a 6-minute demo:

```md
# Demo · "Set up API keys" · 6:12 raw → ~2:10 after suggested cuts
Window: Safari — dashboard.acme.dev · narrated (mic) · 9 steps · 1 recording

dead time: 2:48 idle/loading (14 ranges), 0:41 typing, 0:33 hunting
audio: −21.4 LUFS (target −16) · 148 words/min · opening line: "First, head to settings…"
PII: email at 0:22–1:05 (step 2), key-shaped string 3:40–3:52 (step 6)

1  0:00–0:18  Open Settings          "First, head to settings…"
2  0:18–1:05  Developers tab         loading 0:24–0:39 · "you'll find API keys here"
3  1:05–1:40  Create key             click button "Create key" 1:07 → sheet
4  1:40–2:30  Name and scope         typed 31 chars into "Name" · 3 checkboxes
...
9  5:40–6:12  Make a request         terminal · "and that's it, you get a 200 back"

## Notes (open)
- n1 1:07 region [0.5,0.8,0.1,0.1] voice: "zoom in here, this is the moment"
- n2 3:40 text: "blur the key"
```

**At most two images by default,** the same rule the reel uses: one contact sheet of the current cut, and one hook frame from its first 2 seconds. The opening decides whether people keep watching, so it's the one moment worth seeing in pixels up front. Everything else is text until the agent asks.

### Intents

The digest doesn't change with the kind of video. The edit intent does, and it lives in the first user message, not the system prompt, so the system prompt stays cached:

| Intent | What the agent mostly does | Pixels needed |
|---|---|---|
| **Walkthrough / feature demo** (default) | Cut dead time, speed up typing, auto-zoom on each step's click, step-title callouts, captions from narration | Rarely |
| **Tutorial** | As above, slower pacing, keystroke overlays, chapter markers from steps | Rarely |
| **Bug repro** | Keep everything, mark the failing step, highlight the error text (found by OCR) | Sometimes, to confirm the error |
| **Launch teaser / social cut** | Pick the 3–5 strongest steps, 20–45 s, title cards, cut on music beats | Sometimes, for picking the strongest frame |
| **Notes only** | Apply the user's notes and nothing else | Per note |

**Tools (MCP, rmcp in-process).** Keep them few and terse. Each tool definition sits in context for the whole session.

| Tool | Returns | Budget |
|---|---|---|
| `get_digest(step \| range)` | L1 detail for one step or time range | ~300–800 per step |
| `find(text)` | Matching OCR lines, AX elements and narration with time and rect | tiny |
| `apply_suggestions(kind, steps?)` | Applies the precomputed cuts/speed-ups for dead time, typing or hunting in one call | one-line delta |
| `look(t, region?, px=768)` | A crop or downscaled frame | ≤ ~800 tokens. **The only pixel tool.** Never full Retina |
| `sheet(range, n=8)` | A contact sheet | ≤ 1,600 |
| `add_zoom`, `add_overlay`, `cut`, `set_speed`, `set_template`… | One-line delta: `ok z7 0:12–0:15 ×1.6 → "Export"` | tiny |
| `resolve_note(id, edits)`, `ask_user(q, options)` | — | — |

Edit tools take **semantic targets**: `target: {text: "Export"}` or `{element: "button Export"}` or `{note: "n1"}` or `{step: 3}`. Rust resolves them to a rect and time from OCR/AX. The agent never reads pixels to aim a zoom.

Most demo editing is mechanical: cut idle, speed typing, zoom each click. Rust computes those as suggestions during analysis, and the agent accepts or adjusts them in bulk with `apply_suggestions`, rather than reasoning about 14 idle ranges one by one. The agent's tokens go to judgement: which steps matter, pacing, callout copy.

---

## 3. Session rules for the Claude Code subprocess

`src-tauri/src/agent.rs` already does the two biggest things: `--tools ""` removes Claude Code's built-in tool definitions, and `--setting-sources ""` keeps the user's config out of the agent. On top of that:

1. **Cache-friendly order.** System prompt and tool list stay byte-identical across sessions. The digest goes in the first user message. Never edit earlier turns.
2. **Short sessions.** One session per batch of notes, seeded with a fresh digest, rather than one long resumed thread. Carried context is the biggest cost in the audit.
3. **Write tools return deltas**, never the whole project. `get_project` is for debugging.
4. **Cap pixels per session**, for example 6 `look` calls. Then the tool replies "budget spent, use find/get_digest", and the cap shows in the UI.
5. **Pick models by job.** A fast model at low effort for note → edit (mechanical). The strongest model only for judgement-heavy jobs: picking steps for a teaser, or restructuring a cut across several recordings. The model and effort options already exist in `SessionOptions`.
6. **Track usage.** Show `usage` from each stream-json `result` event (input, cache read, output) in the thread footer, so the cost of a change is visible.

---

## 4. Before and after, per job

Opus 5.5 visual-token tier. "Before" is what a naive agent with a full-frame `render_frame` would do.

| Job | Before | After | Saving |
|---|---|---|---|
| First look at a 60 s recording | 60 frames × 4,784 ≈ **287k** (and >20 images triggers a stricter per-image limit) | L0 ~1k + 1 sheet ~1.6k ≈ **3k** | ~99% |
| First look at a 6 min narrated demo | 360 frames ≈ **1.7M**, more than the context window, so it can't be done. Contact sheets at 8 frames each: 45 × 1.6k ≈ **72k**, with text too small to read | L0 ≈ **2–3k** | ~96% vs sheets |
| Cut dead time in that demo | Agent reasons over sheets and frames per range: **20k+** | `apply_suggestions("dead_time")`, one call ≈ **100** | ~99% |
| Apply one note | full frame 4,784 + project JSON ~1–3k ≈ **7k** | note + L1 for its step + AX element ≈ **500**, plus an optional 768 px crop ≈ 800 | ~80–93% |
| Narration / voice note | not possible (no audio input) | transcript ≈ 3 tokens per second of speech, already in L0/L1 | — |
| Cut a 30 s teaser from the demo | ~15 sheets + spot frames ≈ **60k+** | L0 + L1 for 4 picked steps ≈ **6k** | ~90% |

The first row was measured at small scale (8 s → 38k vs 1.9k). The rest are estimates using Anthropic's published formula. Check them against real `usage` numbers once the tools exist. The longest recording on disk today is 8 s, so step 2 of the build should start by recording a real 3–5 minute narrated demo as the test fixture.

---

## 5. Prompt to build it

Paste this into Claude Code in this repo. It replaces the generic "token-saver mod" prompt with one tied to Spontaneous's architecture.

```text
Build the token-lean agent harness for Spontaneous described in docs/AGENT_HARNESS.md.
It must work for any screen recording, web or mobile, 10 seconds to 10 minutes; most
will be narrated product demos. Read docs/ARCHITECTURE.md §3, §7 and
src-tauri/src/agent.rs first.

Rules:
- The agent must never receive a full-resolution frame. The only pixel tool is
  look(t, region?, px<=768); everything else is text.
- Use Apple frameworks in-process (AVFoundation, Vision, Speech, Accelerate,
  ApplicationServices AX). No Homebrew, Python or ffmpeg at runtime.
- The always-in-context outline (L0) stays under 3k tokens for any length. Detail is
  fetched per step.
- Mechanical edits (dead time, typing, click zooms) are computed in Rust as
  suggestions; the agent accepts them in bulk and spends its tokens on judgement.
- Each step ends with a measured before/after token count on two fixtures: a short
  recording from ~/Movies/Spontaneous and a 3–5 minute narrated demo (ask me to record
  it). Use the stream-json usage fields or the w*h/750 image formula (cap 4,784 on
  high-res models).
- Stop and show me the numbers and the diff before adding any dependency or permission.

Steps, one at a time:
1. Capture: at each click-down, record the AX element under the cursor (role, title,
   frame) into clicks.jsonl. Add focus.jsonl from AX focus notifications and record
   window title / URL changes.
2. Analysis: after Stop, write cache/digest.json and cache/sheet.jpg. Steps from
   input + window/URL changes + narration pauses; shots from feature-print distance;
   OCR on shot keyframes only, new lines only; dead-time, typing and scroll ranges with
   suggested cuts/speeds; narration via SpeechAnalyzer attached to steps; saliency
   rects; PII from OCR + NSDataDetector. Show both fixtures' digests and timings.
3. Digest renderer: digest.json → L0 outline and L1 per-step markdown, in the formats
   in §2.
4. MCP tools: get_digest, find, look, sheet, apply_suggestions, and the write tools
   with semantic targets that resolve in Rust. Write tools return one-line deltas.
5. Session: intent + L0 as the first user message, a per-session look budget, and
   usage totals shown in the agent panel footer.
```

---

## 6. Open questions

- **Opus 5.5 vs a smaller model for note → edit.** Needs a side-by-side on 10 real notes. The win depends on how often a crop is actually needed.
- **AX coverage.** Web content in Safari and Chrome exposes AX well. Electron and canvas apps (Figma) often don't, and mirrored iPhones expose nothing, so OCR remains the fallback.
- **Step titles without narration.** Silent demos depend on AX labels and OCR for step names. Check how readable those titles are on a silent recording before relying on them in callouts.
- **Analysis time on long demos.** OCR on shot keyframes only should keep a 10-minute recording under a minute on an M1. Measure it, and run it in the background so the editor opens straight away.
- **SpeechAnalyzer accuracy and language coverage.** On the reel it was fast but misheard product words: "face detect" came out as "face a tech", and "on screen" as "offscreen". For captions, show the transcript for review, and bias recognition toward words from OCR (product names, button labels) where the API allows custom vocabulary. Fall back to Whisper only for languages Apple doesn't cover.
- **The prototype** (`see.swift` for OCR and saliency, `hear.swift` for SpeechAnalyzer, `digest.py`) lives in a session scratch folder, not the repo. Port it to Rust/Swift in step 2, don't copy it.

Sources: [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) (resolution tiers and token table) · [MacStories SpeechAnalyzer test](https://www.macstories.net/stories/hands-on-how-apples-new-speech-apis-outpace-whisper-for-lightning-fast-transcription/) · [Argmax benchmark](https://www.argmaxinc.com/blog/apple-and-argmax) · [Foundation Models guide](https://www.atelier-socle.com/en/articles/foundation-models-api-guide)
