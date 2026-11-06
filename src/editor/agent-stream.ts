import type { AgentMessage } from "@/ui/organisms/agent/runtime";
import type { AgentEvent } from "@/platform/agent";

type Part = Exclude<AgentMessage["content"], string>[number];

interface Block { type?: string; text?: string; thinking?: string }
interface Delta { type?: string; text?: string; thinking?: string }

type ToolPart = Extract<Part, { type: "tool-call" }>;

/**
 * UI blocks. Until the agent has real tools, it brings up a component by
 * writing a fenced block in its reply, named after the tool it stands for:
 *
 *   ```spontaneous propose_plan
 *   { "title": "…", "steps": […] }
 *   ```
 *
 * The block becomes a tool-call part with that name and payload, the same
 * shape a real MCP tool call produces, so the thread renders both the same way.
 * While the block streams, its part holds the raw text and no args.
 */
export const BLOCK_TOOLS = [
  "ask_user", "propose_plan", "request_approval", "request_permission", "propose_text_edit",
  "suggest_shot", "answer_with_moments", "try_variants", "reply_to_note",
] as const;

const OPEN = /```spontaneous[ \t]+([a-z_]+)[ \t]*\r?\n/;
const CLOSE = /\r?\n[ \t]*```/;

/** Where a block part is: still streaming, ready to render, or unreadable. */
export type BlockState = "open" | "ready" | "invalid";
export const blockState = (part: Part | undefined): BlockState | undefined =>
  part?.type === "tool-call" ? (part.artifact as { block?: BlockState } | undefined)?.block : undefined;

let blockCount = 0;

function closeBlock(part: ToolPart, raw: string): ToolPart {
  try {
    const args = JSON.parse(raw) as Record<string, unknown>;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("not an object");
    return { ...part, args: args as never, argsText: raw, artifact: { block: "ready" } };
  } catch (error) {
    if (import.meta.env?.DEV) console.warn(`[agent] unreadable ${part.toolName} block`, error, raw);
    return { ...part, argsText: raw, artifact: { block: "invalid" } };
  }
}

/** Appends streamed text, turning fenced UI blocks into tool-call parts as their fences arrive. */
function appendText(content: Part[], more: string): Part[] {
  const parts = [...content];
  let rest = more;
  while (rest) {
    const last = parts.at(-1);
    if (last?.type === "tool-call" && blockState(last) === "open") {
      const raw = (last.argsText ?? "") + rest;
      const close = CLOSE.exec(raw);
      if (!close) { parts[parts.length - 1] = { ...last, argsText: raw }; break; }
      parts[parts.length - 1] = closeBlock(last, raw.slice(0, close.index));
      rest = raw.slice(close.index + close[0].length).replace(/^\s+/, "");
      continue;
    }
    // Text that starts right after a block drops the blank lines its closing fence left;
    // until something visible arrives there's no text part, so later newlines are dropped too.
    const text = last?.type === "text" ? last.text + rest : blockState(last) ? rest.replace(/^\s+/, "") : rest;
    if (!text && blockState(last)) break;
    const open = OPEN.exec(text);
    if (last?.type === "text") parts.pop();
    if (!open) { parts.push({ type: "text", text }); break; }
    const before = text.slice(0, open.index).replace(/\s+$/, "");
    if (before) parts.push({ type: "text", text: before });
    parts.push({ type: "tool-call", toolCallId: `ui-${Date.now().toString(36)}-${++blockCount}`, toolName: open[1]!, args: {} as never, argsText: "", artifact: { block: "open" } } as ToolPart);
    rest = text.slice(open.index + open[0].length);
    if (!rest) break;
  }
  return parts;
}

/** Appends to the last part, or starts one if the stream didn't open a block first. */
function append(content: Part[], type: "text" | "reasoning", more: string): Part[] {
  if (type === "text") return appendText(content, more);
  const last = content.at(-1);
  if (last?.type === type) return [...content.slice(0, -1), { type, text: last.text + more }];
  return [...content, { type, text: more }];
}

/** At the end of a turn, a block whose closing fence never came is read as it stands. */
export function finalizeBlocks(content: Part[]): Part[] {
  return content.map((p) => (p.type === "tool-call" && blockState(p) === "open" ? closeBlock(p, p.argsText ?? "") : p));
}

/**
 * Text as shown while it streams: a fence that has started arriving but isn't
 * a whole line yet is held back, so "```spontaneous pro" never flashes.
 */
export function visibleText(text: string): string {
  return text.replace(/\n?`{1,3}(?:s(?:p(?:o(?:n(?:t(?:a(?:n(?:e(?:o(?:u(?:s(?:[ \t]+[a-z_]*)?)?)?)?)?)?)?)?)?)?)?)?$/, "");
}

/**
 * Folds one CLI event into the assistant message's parts. Text arrives as
 * partial deltas, then again in a complete `assistant` event, which only counts
 * if no deltas came.
 */
export function reduceParts(content: Part[], event: AgentEvent): Part[] {
  if (event.type === "stream_event") {
    const inner = event.event as { type?: string; content_block?: Block; delta?: Delta };
    if (inner.type === "content_block_start") {
      // A new text block starts a new part, unless a UI block is still open across it.
      if (inner.content_block?.type === "text") return blockState(content.at(-1)) === "open" ? appendText(content, inner.content_block.text ?? "") : appendText([...content, { type: "text", text: "" }], inner.content_block.text ?? "");
      if (inner.content_block?.type === "thinking") return [...content, { type: "reasoning", text: inner.content_block.thinking ?? "" }];
    }
    if (inner.type === "content_block_delta") {
      if (inner.delta?.type === "text_delta") return append(content, "text", inner.delta.text ?? "");
      if (inner.delta?.type === "thinking_delta") return append(content, "reasoning", inner.delta.thinking ?? "");
    }
    return content;
  }
  if (event.type === "assistant" && !content.length) {
    const blocks = (event.message as { content?: Block[] }).content ?? [];
    return blocks.reduce<Part[]>((parts, b) => (b.type === "text" ? appendText([...parts, { type: "text", text: "" }], b.text ?? "") : parts), [])
      .filter((p) => p.type !== "text" || p.text);
  }
  return content;
}

/**
 * Used only when the installed CLI can't list its own models, as in the browser
 * preview. The aliases follow the latest version, so they don't name one.
 */
export const AGENT_MODELS = [
  { value: "default", label: "Default" },
  { value: "fable", label: "Fable" },
  { value: "opus", label: "Opus" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

/** The fallback effort levels, for the same case. */
export const AGENT_EFFORTS = [
  { value: "default", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max" },
];

const EFFORT_LABELS: Record<string, string> = { xhigh: "Extra high" };

/** Levels the CLI names but this app hasn't seen get their name capitalized. */
export function effortLabel(level: string): string {
  return EFFORT_LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

/** "claude-opus-5-5" reads as "Opus 5.5". Anything else is shown as it came. */
export function modelName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  if (!match) return id;
  const [, family, major, minor] = match;
  return `${family!.charAt(0).toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ""}`;
}
