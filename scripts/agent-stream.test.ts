/** UI blocks in the agent's streamed replies. Run: npm run test:agent */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blockState, finalizeBlocks, reduceParts, visibleText } from "../src/editor/agent-stream.ts";

type Parts = Parameters<typeof reduceParts>[0];

const start = (text = "") => ({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text", text } } });
const delta = (text: string) => ({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });
const feed = (chunks: string[], parts: Parts = []) => [start(), ...chunks.map(delta)].reduce((p, e) => reduceParts(p, e), parts);
/** Every way of cutting a string into two pieces, so a fence can land on any boundary. */
const splits = (s: string) => Array.from({ length: s.length - 1 }, (_, i) => [s.slice(0, i + 1), s.slice(i + 1)]);
const shape = (parts: Parts) => parts.map((p) => (p.type === "tool-call" ? `[${p.toolName}:${blockState(p)}]` : p.type === "text" ? p.text : p.type));

const REPLY = 'Here is the plan.\n```spontaneous propose_plan\n{ "title": "Tighten it", "steps": [{ "id": "s1", "title": "Zoom on Create", "tool": "add_zoom" }] }\n```\nRun it when you are ready.';

test("a block becomes a tool-call part between the text around it", () => {
  const parts = feed([REPLY]);
  assert.deepEqual(shape(parts), ["Here is the plan.", "[propose_plan:ready]", "Run it when you are ready."]);
  const tool = parts[1] as Extract<Parts[number], { type: "tool-call" }>;
  assert.equal((tool.args as { title: string }).title, "Tighten it");
  assert.match(tool.toolCallId, /^ui-/);
});

test("the result is the same however the stream is cut", () => {
  const whole = shape(feed([REPLY]));
  for (const [a, b] of splits(REPLY)) assert.deepEqual(shape(feed([a!, b!])), whole, JSON.stringify([a, b]));
  assert.deepEqual(shape(feed([...REPLY])), whole, "one character at a time");
});

test("a block still streaming holds its text and shows nothing raw", () => {
  const parts = feed(['Planning.\n```spontaneous propose_plan\n{ "title": "Tigh']);
  assert.deepEqual(shape(parts), ["Planning.", "[propose_plan:open]"]);
  assert.equal(parts.some((p) => p.type === "text" && p.text.includes("{")), false);
});

test("several blocks in one reply, and none", () => {
  const two = 'A.\n```spontaneous suggest_shot\n{"options":[]}\n```\nB.\n```spontaneous ask_user\n{"question":"Pace?","options":["Fast","Slow"]}\n```\n';
  assert.deepEqual(shape(feed([two])), ["A.", "[suggest_shot:ready]", "B.", "[ask_user:ready]"]);
  assert.deepEqual(shape(feed(["Plain reply with `code` and ```js\nfenced code\n```"])), ["Plain reply with `code` and ```js\nfenced code\n```"]);
});

test("unreadable JSON is marked, not thrown", () => {
  assert.deepEqual(shape(feed(['```spontaneous propose_plan\n{ "title": oops }\n```'])), ["[propose_plan:invalid]"]);
});

test("a block left open at the end of a turn is read as it stands", () => {
  const parts = finalizeBlocks(feed(['```spontaneous ask_user\n{"question":"Pace?","options":["A","B"]}']));
  assert.deepEqual(shape(parts), ["[ask_user:ready]"]);
});

test("a whole assistant message with no deltas is split the same way", () => {
  const parts = reduceParts([], { type: "assistant", message: { content: [{ type: "text", text: REPLY }] } });
  assert.deepEqual(shape(parts), ["Here is the plan.", "[propose_plan:ready]", "Run it when you are ready."]);
});

test("blank lines after a block are dropped however they arrive", () => {
  const parts = feed(['```spontaneous ask_user\n{"question":"Pace?","options":["A","B"]}\n```', "\n", "\n", "\nFor the opening:"]);
  assert.deepEqual(shape(parts), ["[ask_user:ready]", "For the opening:"]);
});

test("a real Claude Code turn: two blocks between plain sentences", () => {
  // Captured from the CLI with the app's flags and prompt, then scrubbed of ids and paths.
  const events = readFileSync(new URL("./fixtures/live-plan-and-shot.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const parts = finalizeBlocks(events.reduce((p, e) => reduceParts(p, e), [] as Parts)).filter((p) => p.type !== "reasoning");
  const s = shape(parts);
  assert.equal(s[1], "[propose_plan:ready]");
  assert.equal(s[3], "[suggest_shot:ready]");
  assert.equal(parts.length, 4);
  for (const p of parts) if (p.type === "text") assert.doesNotMatch(p.text, /^\s|```/, "text is clean around blocks");
  const plan = parts[1] as Extract<Parts[number], { type: "tool-call" }>;
  assert.deepEqual((plan.args as { steps: { tool: string }[] }).steps.map((x) => x.tool), ["add_zoom", "add_overlay"]);
});

test("a fence that is still arriving never flashes", () => {
  assert.equal(visibleText("Here.\n```spontan"), "Here.");
  assert.equal(visibleText("Here.\n```spontaneous propose_pl"), "Here.");
  assert.equal(visibleText("Use `code` here"), "Use `code` here");
  assert.equal(visibleText("Done."), "Done.");
});
