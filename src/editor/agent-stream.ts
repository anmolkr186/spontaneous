import type { AgentMessage } from "@/ui/organisms/agent/runtime";
import type { AgentEvent } from "@/platform/agent";

type Part = Exclude<AgentMessage["content"], string>[number];

interface Block { type?: string; text?: string; thinking?: string }
interface Delta { type?: string; text?: string; thinking?: string }

/** Appends to the last part, or starts one if the stream didn't open a block first. */
function append(content: Part[], type: "text" | "reasoning", more: string): Part[] {
  const last = content.at(-1);
  if (last?.type === type) return [...content.slice(0, -1), { type, text: last.text + more }];
  return [...content, { type, text: more }];
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
      if (inner.content_block?.type === "text") return [...content, { type: "text", text: inner.content_block.text ?? "" }];
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
    return blocks.flatMap((b): Part[] => (b.type === "text" ? [{ type: "text", text: b.text ?? "" }] : []));
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
