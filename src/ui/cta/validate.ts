/**
 * Checks a label the agent proposed before it goes on a key. The agent words
 * the key when it knows best ("Tighten the intro"); the app makes sure the
 * words are a real action of the right kind, short, and honest about counts
 * and risk. Anything that fails falls back to the derived label.
 */
import type { CtaContext, CtaIntent, CtaProposal, ResolvedLabel } from "./types.ts";

/** Verbs a label may start with, per intent. */
export const VERBS: Record<CtaIntent, string[]> = {
  decide: ["approve", "allow", "replace", "overwrite", "delete", "remove", "send", "upload", "post", "publish", "use", "answer", "export", "cut", "trim", "change", "always"],
  run: ["run", "apply", "start", "retry", "try", "render", "cut", "zoom", "add", "retime", "speed", "slow", "trim", "tighten", "fix", "send", "ask", "draft", "make", "change", "edit", "blur"],
  review: ["accept", "review", "keep", "apply"],
  apply: ["apply", "use", "add", "cut", "zoom", "retime", "trim", "insert", "change", "go", "jump"],
  finish: ["export", "share", "copy", "save", "publish", "render"],
  navigate: ["open", "show", "go", "view", "watch", "see", "jump"],
  dismiss: ["dismiss", "cancel", "skip", "keep", "deny", "decline", "not", "discard", "close", "stop"],
};

/** Words that say nothing about what happens. Never a whole label. */
const VAGUE = new Set(["confirm", "ok", "okay", "yes", "submit", "continue", "proceed", "go", "do it", "done", "accept", "apply", "run"]);

/** Objects that name nothing: "Use it", "Apply suggestion", "Do this now". */
const FILLER = new Set(["it", "this", "that", "these", "them", "suggestion", "suggestions", "action", "thing", "things", "all", "everything", "now", "here", "stuff"]);

export const MAX_CHARS = 28;
export const MAX_WORDS = 4;

export type Verdict = { ok: true; label: string } | { ok: false; reason: string };

/** Is this a label we'd put on a key for this context? */
export function checkLabel(raw: string, ctx: CtaContext): Verdict {
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, reason: "Empty" };
  if (label.length > MAX_CHARS) return { ok: false, reason: `Longer than ${MAX_CHARS} characters` };
  const words = label.split(" ");
  if (words.length > MAX_WORDS) return { ok: false, reason: `More than ${MAX_WORDS} words` };
  if (/[!?…]|\.\.\.|\p{Extended_Pictographic}/u.test(label)) return { ok: false, reason: "Punctuation or emoji" };
  if (label[0] !== label[0]!.toUpperCase()) return { ok: false, reason: "Not sentence case" };
  if (VAGUE.has(label.toLowerCase())) return { ok: false, reason: "Doesn't say what happens" };
  const rest = words.slice(1).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}:×.–-]/gu, ""));
  if (rest.length && rest.every((w) => FILLER.has(w))) return { ok: false, reason: "Doesn't say what happens" };
  const verb = words[0]!.toLowerCase();
  if (!VERBS[ctx.intent].includes(verb)) return { ok: false, reason: `"${words[0]}" isn't a ${ctx.intent} verb` };
  if (ctx.risk === "destructive" && words.length < 2) return { ok: false, reason: "A destructive action must name what it affects" };
  const number = label.match(/\b\d+\b(?!:)/);
  if (ctx.count !== undefined && number && !/\d:\d/.test(label) && Number(number[0]) !== ctx.count) {
    return { ok: false, reason: `Says ${number[0]}, but it affects ${ctx.count}` };
  }
  return { ok: true, label };
}

/** The label to show: the agent's when it passes, the derived one otherwise. */
export function resolveLabel(proposed: string | undefined, derived: string, ctx: CtaContext): ResolvedLabel {
  if (!proposed) return { label: derived, source: "derived" };
  const verdict = checkLabel(proposed, ctx);
  return verdict.ok ? { label: verdict.label, source: "agent" } : { label: derived, source: "derived", rejected: verdict.reason };
}

/** Pulls the primary label out of a proposal, ignoring one meant for another intent. */
export function proposedPrimary(proposal: CtaProposal | undefined, intent: CtaIntent) {
  const p = proposal?.primary;
  return p && (!p.intent || p.intent === intent) ? p.label : undefined;
}
