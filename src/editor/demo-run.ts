/**
 * The demo run: a scripted session that shows every agent component in the real
 * panel, in the browser and in the built app. It never calls Claude Code and
 * costs no plan usage. Each turn is a run of its own, built from the same parts
 * the live agent produces (text, reasoning, tool calls, UI blocks), so what you
 * see here is exactly how a live turn renders. Plans and suggestions you answer
 * apply real, undoable edits to the open project.
 */
import { uid } from "./model";
import { useEditor } from "./store";

export interface DemoKit {
  /** False once something else took over the agent (a new message, Stop). */
  alive: () => boolean;
  /** Opens a turn: your message and an empty agent reply. */
  start: (text: string) => void;
  finish: () => void;
  push: (part: unknown) => void;
  patch: (toolCallId: string, patch: { result?: unknown; args?: unknown }) => void;
  /** Ends the turn waiting on an answer. */
  hold: () => void;
  streamText: (type: "text" | "reasoning", text: string) => Promise<void>;
  sleep: (ms: number) => Promise<unknown>;
}

const id = () => `demo-${uid("")}`;

export async function playDemo(kit: DemoKit) {
  const { project } = useEditor.getState();
  const notes = project.notes.filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);
  const first = notes[0]?.at ?? 12;
  const overlay = project.overlays[0];
  const block = (toolName: string, args: unknown) => kit.push({ type: "tool-call", toolCallId: id(), toolName, args, argsText: JSON.stringify(args), artifact: { block: "ready" } });
  /** A read tool that takes a moment and returns. */
  const read = async (toolName: string, args: unknown, result: unknown) => {
    const toolCallId = id();
    kit.push({ type: "tool-call", toolCallId, toolName, args });
    await kit.sleep(520);
    kit.patch(toolCallId, { result });
  };
  const turn = async (said: string, body: () => Promise<void>, wait = false) => {
    if (!kit.alive() && said !== FIRST) return false;
    kit.start(said);
    await kit.sleep(900);
    if (!kit.alive()) return false;
    await body();
    if (!kit.alive()) return false;
    if (wait) kit.hold(); else kit.finish();
    await kit.sleep(1400);
    return true;
  };

  // 1. Read the project, then propose a plan you can run. One step can't be applied yet, on purpose.
  const ok = await turn(FIRST, async () => {
    await kit.streamText("reasoning", `The first note sits at ${Math.round(first)}s. I'll check what was clicked around it and look at the frame before proposing anything.`);
    await read("get_project", { fields: ["notes", "zooms", "overlays"] }, { notes: notes.length, zooms: project.zooms.length });
    await read("get_input_events", { from: Math.max(0, first - 3), to: first + 5, kinds: ["click"] }, { clicks: [first + 0.6] });
    await read("render_frame", { at: first + 0.6 }, { ok: true });
    await kit.streamText("text", "Here's what I'd change. Reorder or remove steps, then run it.");
    block("propose_plan", {
      title: "Tighten the start",
      estimate: "~10s",
      steps: [
        { id: "s1", title: "Zoom on the click", tool: "add_zoom", args: { start: Math.max(0, first - 1), end: first + 4, scale: 1.8, target: { x: 0.36, y: 0.84 } } },
        { id: "s2", title: "Call out what it does", tool: "add_overlay", args: { kind: "callout", start: first + 0.5, end: first + 3.5, label: "Create a project" } },
        { id: "s3", title: "Calmer camera", tool: "set_motion", args: { speed: 0.85, amount: 0.7 } },
        { id: "s4", title: "Cut the pause after it", tool: "cut", args: { start: first + 6, end: first + 9 } },
      ],
    });
  });
  if (!ok) return;

  // 2. An answer that cites the moments it rests on.
  if (!(await turn("What should change in the first fifteen seconds?", async () => {
    block("answer_with_moments", {
      segments: [
        { text: "Trim the filler at the start; you say \"um\" before the page has loaded.", cite: ["m1"] },
        { text: " Then zoom in on the button as you click it, since it's small on a phone.", cite: ["m2", ...(notes[0] ? [notes[0].id] : [])] },
      ],
      moments: [
        { id: "m1", at: 0.4, kind: "transcript", title: "Intro", quote: "So, um, this is the Projects page.", highlight: ["um"] },
        { id: "m2", at: first + 0.6, kind: "click", title: "Click on Create" },
        ...(notes[0] ? [{ id: notes[0].id, at: notes[0].at, kind: "note", pin: 1, title: notes[0].text }] : []),
      ],
      edits: 2,
    });
  }))) return;

  // 3. A shot it likes, and three ways it tried to pace the intro.
  if (!(await turn("Make the opening feel more like a launch.", async () => {
    await kit.streamText("text", "Two ideas. First the shot:");
    block("suggest_shot", {
      context: "0:00–0:06",
      options: [
        { id: "lid-rise", label: "Lid Rise", reason: "The lid opens and the screen powers on: a strong opener, though it adds about 1.6s.", confidence: 3 },
        { id: "orbit-in", label: "Orbit In", reason: "A slow orbit settles on the screen. Calmer, and quicker to read.", confidence: 2 },
      ],
    });
    await kit.streamText("text", "Then the pace. I compared three cuts of the intro:");
    block("try_variants", {
      task: "Pace the intro",
      attempts: [
        { id: "a1", name: "Tight cut", approach: "Cut the pauses", score: 86, note: "Cuts 6.4s · keeps the click" },
        { id: "a2", name: "Speed ramp 2×", approach: "Ramp the typing", score: 71, note: "Saves 3.5s · the typing reads rushed" },
        { id: "a3", name: "Zoom + callout", approach: "Hold and explain", score: 64, note: "Adds 1.2s · clearest for new users" },
      ],
    });
  }))) return;

  // 4. Words: accept or reject each change.
  if (!(await turn("Make the callout shorter.", async () => {
    block("propose_text_edit", overlay
      ? { target: `overlay:${overlay.id}`, label: "Callout · Make it shorter", original: overlay.label, suggested: shorten(overlay.label) }
      : { target: "title", label: "Title · Make it shorter", original: project.name, suggested: shorten(project.name) });
  }))) return;

  // 5. A right it doesn't have yet.
  if (!(await turn("Export it to my Movies folder.", async () => {
    block("request_permission", {
      action: "write to ~/Movies/Spontaneous",
      target: "Files · ~/Movies/Spontaneous",
      risk: "risky",
      reason: "The export is ready. I'll write the video, its captions and a poster frame there; nothing already in the folder is replaced.",
      preview: [
        { id: "f1", label: `${project.name}.mp4`, meta: "182 MB" },
        { id: "f2", label: `${project.name}.srt`, meta: "4 KB" },
        { id: "f3", label: `${project.name}-poster.png`, meta: "1.2 MB" },
      ],
    });
  }))) return;

  // 6. A question only you can answer; the panel waits for it.
  await turn("Draft a launch cut from this.", async () => {
    await kit.streamText("text", "Before I cut it down:");
    block("ask_user", { question: "What pace should the launch cut have?", options: ["Punchy, 20s", "Walkthrough, 45s", "Feature trio, 3×10s"] });
  }, true);
}

const FIRST = "Tighten the start of this walkthrough.";

/** A shorter version for the demo's text edit: drop filler words and anything after a comma. */
function shorten(text: string) {
  const short = text.split(/[,–—]/)[0]!.replace(/\b(just|really|simply|here you|so|um|uh)\b\s*/gi, "").replace(/\s+/g, " ").trim();
  return short && short !== text ? short : `${text.split(" ").slice(0, 3).join(" ")}`;
}
