/**
 * Calls to action. Every key that moves the work forward says what it will do
 * ("Apply zoom at 0:12", not "Apply"), and each surface shows exactly one
 * primary: the action that matters most right now.
 *
 * Plain types only, so Node can run the label and election logic in tests.
 */

/**
 * What kind of step a CTA is, which also ranks it when several compete.
 *   decide    the agent is waiting on you: approve, allow, answer
 *   run       start work: run a plan, apply notes, send
 *   review    accept or reject what the agent proposed
 *   apply     take one suggestion: use a shot, apply an answer
 *   finish    wrap up: export, share
 *   navigate  go somewhere: open, show, watch
 *   dismiss   the way out: deny, cancel, keep current. Never primary.
 */
export type CtaIntent = "decide" | "run" | "review" | "apply" | "finish" | "navigate" | "dismiss";

export type CtaRisk = "safe" | "risky" | "destructive";

/** Kinds of edit a CTA can name. */
export type EditKind = "zoom" | "blur" | "callout" | "speed" | "cut" | "style" | "shot" | "audio" | "text" | "overlay";

/** What the agent may send with any UI tool call to word its keys. */
export interface CtaProposal {
  primary?: { label: string; intent?: CtaIntent };
  secondary?: { label: string; intent?: CtaIntent }[];
}

/** What a label is checked against. */
export interface CtaContext {
  intent: CtaIntent;
  risk?: CtaRisk;
  /** The number of things the action touches; a number in the label must match it. */
  count?: number;
}

export interface ResolvedLabel {
  label: string;
  source: "agent" | "derived";
  /** Why the agent's label was turned down, when it was. */
  rejected?: string;
}

/** How strongly each intent claims the primary. */
export const PRIORITY: Record<CtaIntent, number> = { decide: 100, run: 80, review: 60, apply: 50, finish: 30, navigate: 10, dismiss: 0 };
