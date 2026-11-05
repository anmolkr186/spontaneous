/**
 * Regions and roles. Wrap the window in a <CtaRoot> and each surface in a
 * <CtaRegion name>; every CtaKey that can be primary registers as a candidate,
 * and the election (elect.ts) hands out one primary per region. Outside any
 * region a CtaKey stands alone and is primary when it asks to be, so components
 * keep working on their own (docs previews, tests).
 */
import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { elect } from "./elect";
import type { Candidate } from "./elect";
import type { CtaIntent } from "./types";

class Election {
  private candidates = new Map<string, Candidate>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private winners = new Set<string>();
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  snapshot = () => this.winners;
  put(c: Omit<Candidate, "seq">) {
    const prev = this.candidates.get(c.id);
    // A candidate counts as new when it appears or becomes enabled, so typing in the
    // composer makes Send the newest run and clearing it hands the primary back.
    const next = { ...c, seq: prev && (prev.enabled || !c.enabled) ? prev.seq : ++this.seq };
    if (prev && prev.region === next.region && prev.intent === next.intent && prev.enabled === next.enabled) return;
    this.candidates.set(c.id, next);
    this.recount();
  }
  drop(id: string) { if (this.candidates.delete(id)) this.recount(); }
  private recount() {
    const next = elect([...this.candidates.values()]);
    const same = next.size === this.winners.size && [...next].every((id) => this.winners.has(id));
    if (same) return;
    this.winners = next;
    this.listeners.forEach((l) => l());
  }
}

const RootContext = createContext<Election | null>(null);
const RegionContext = createContext<string | null>(null);

/** One per window: the cross-region ceiling (Export waits for work) needs every region in one election. */
export function CtaRoot({ children }: { children: ReactNode }) {
  const election = useMemo(() => new Election(), []);
  return <RootContext.Provider value={election}>{children}</RootContext.Provider>;
}

/** A surface that shows one primary: the agent panel, the notes list, the title bar. */
export function CtaRegion({ name, children }: { name: string; children: ReactNode }) {
  const outer = useContext(RootContext);
  const own = useMemo(() => (outer ? null : new Election()), [outer]);
  const tree = <RegionContext.Provider value={name}>{children}</RegionContext.Provider>;
  return own ? <RootContext.Provider value={own}>{tree}</RootContext.Provider> : tree;
}

export type CtaRole = "primary" | "secondary";

/**
 * The role a candidate holds right now. `fallback` is the role it takes with
 * no region around it. Non-candidates (dismiss) are always secondary.
 */
export function useCtaRole(intent: CtaIntent, enabled: boolean, fallback: CtaRole = "primary"): CtaRole {
  const election = useContext(RootContext);
  const region = useContext(RegionContext);
  const id = useId();
  const latest = useRef({ intent, enabled });
  latest.current = { intent, enabled };
  useLayoutEffect(() => {
    if (!election || !region) return;
    election.put({ id, region, ...latest.current });
  });
  useLayoutEffect(() => {
    if (!election || !region) return;
    return () => election.drop(id);
  }, [election, region, id]);
  const winners = useSyncExternalStore(election?.subscribe ?? noop, election?.snapshot ?? empty, election?.snapshot ?? empty);
  if (intent === "dismiss") return "secondary";
  if (!election || !region) return fallback;
  return winners.has(id) ? "primary" : "secondary";
}

const none = new Set<string>();
const empty = () => none;
const noop = () => () => {};
