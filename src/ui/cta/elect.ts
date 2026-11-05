/**
 * The election: which candidate in each region becomes the one primary.
 *
 *   1. Only enabled candidates can win; dismiss actions never do.
 *   2. Higher intent wins: decide > run > review > apply > finish > navigate.
 *   3. A tie goes to the newest candidate: the one that appeared or became
 *      enabled last (a card that just arrived, Send once you've typed).
 *   4. Ceiling: a finish action (Export) can't be primary anywhere while any
 *      region has a decide or run candidate. Finishing waits for the work.
 */
import { PRIORITY } from "./types.ts";
import type { CtaIntent } from "./types.ts";

export interface Candidate {
  id: string;
  region: string;
  intent: CtaIntent;
  enabled: boolean;
  /** When it appeared or last became enabled; higher is newer. */
  seq: number;
}

/** Ids of the candidates elected primary, at most one per region. */
export function elect(candidates: Candidate[]): Set<string> {
  const live = candidates.filter((c) => c.enabled && c.intent !== "dismiss");
  const workPending = live.some((c) => PRIORITY[c.intent] >= PRIORITY.run);
  const winners = new Map<string, Candidate>();
  for (const c of live) {
    if (c.intent === "finish" && workPending) continue;
    const best = winners.get(c.region);
    if (!best || PRIORITY[c.intent] > PRIORITY[best.intent] || (PRIORITY[c.intent] === PRIORITY[best.intent] && c.seq > best.seq)) winners.set(c.region, c);
  }
  return new Set([...winners.values()].map((c) => c.id));
}
