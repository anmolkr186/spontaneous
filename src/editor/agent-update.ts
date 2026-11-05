import { create } from "zustand";
import { agent } from "@/platform/agent";
import { isTauri } from "@/platform/tauri";
import { useAgent } from "./agent";

export type UpdateState =
  | { status: "idle" }
  | { status: "updating" }
  | { status: "updated"; version: string }
  | { status: "failed"; error: string };

interface AgentUpdateState {
  /** Set when a newer Claude Code than the installed one is out. */
  available: { installed: string; latest: string } | null;
  state: UpdateState;
  /** Compares once per launch. A failed lookup stays silent: nobody asked for it. */
  check: (installed: string) => Promise<void>;
  install: () => Promise<void>;
  /** Only for this launch: the next one checks again. */
  dismiss: () => void;
}

/** "2.1.318 (Claude Code)" reads as [2, 1, 318]. */
export function parseVersion(text: string): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(latest: number[], installed: number[]): boolean {
  for (let i = 0; i < 3; i++) if (latest[i] !== installed[i]) return latest[i]! > installed[i]!;
  return false;
}

let checked = false;

export const useAgentUpdate = create<AgentUpdateState>((set, get) => ({
  available: null,
  state: { status: "idle" },

  check: async (installedText) => {
    if (!isTauri || checked) return;
    checked = true;
    const installed = parseVersion(installedText);
    const latestText = await agent.latestVersion().catch(() => undefined);
    const latest = latestText ? parseVersion(latestText) : null;
    if (!installed || !latest || !isNewer(latest, installed)) return;
    set({ available: { installed: installed.join("."), latest: latest.join(".") } });
  },

  install: async () => {
    const available = get().available;
    if (!available || get().state.status === "updating") return;
    set({ state: { status: "updating" } });
    try {
      await agent.update();
      const status = await agent.status();
      const now = parseVersion(status?.version ?? "");
      if (!now || isNewer(parseVersion(available.latest)!, now)) {
        set({ state: { status: "failed", error: `Still on ${now?.join(".") ?? available.installed} after updating.` } });
        return;
      }
      useAgent.setState({ cliVersion: status?.version ?? null });
      // The running process is the old version, so the next message starts the new one.
      useAgent.getState().restartSession();
      // A new version can bring new models and effort levels.
      void useAgent.getState().loadCatalog();
      set({ state: { status: "updated", version: now.join(".") } });
    } catch (error) {
      set({ state: { status: "failed", error: String(error) } });
    }
  },

  dismiss: () => set({ available: null, state: { status: "idle" } }),
}));
