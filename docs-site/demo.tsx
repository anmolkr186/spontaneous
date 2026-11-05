/**
 * Helpers for component previews. Previews show a component where it lives:
 * in the agent panel, under the message that caused it. They autoplay a short
 * script so the motion is visible, and the Replay key on the preview restarts it.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Mark } from "@/ui/atoms";
import { agentStyles } from "@/ui/organisms/agent";

/** The agent panel's column: its width and surface. Previews of chat and agent parts sit in one. */
export function DemoPanel({ width = 380, children, style }: { width?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ width, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 16, background: "var(--surface)", boxShadow: "var(--card-shadow)", ...style }}>
      {children}
    </div>
  );
}

/** Your message, exactly as the thread draws it. */
export function UserSays({ children }: { children: ReactNode }) {
  return (
    <div className={agentStyles.user} style={{ margin: 0 }}>
      <div className={agentStyles.userBubble}>{children}</div>
    </div>
  );
}

/** The agent's byline, exactly as the thread draws it, with what it said below. */
export function AgentSays({ children, status }: { children?: ReactNode; status?: ReactNode }) {
  return (
    <div className={agentStyles.assistant} style={{ margin: 0 }}>
      <div className={agentStyles.byline}><Mark size={14} title="" /><span>Spontaneous</span>{status && <span>{status}</span>}</div>
      {children && <div className={agentStyles.assistantBody}>{children}</div>}
    </div>
  );
}

export interface Beat { at: number; run: () => void }

/**
 * Plays a script of beats once, from mount: `at` is ms from the start.
 * Stops for good the moment someone clicks or types in the preview, so the
 * demo never fights the person trying it. Returns a ref for that preview root.
 */
export function useScript(beats: Beat[], { loop }: { loop?: number } = {}) {
  const root = useRef<HTMLDivElement>(null);
  const [stopped, setStopped] = useState(false);
  const latest = useRef(beats);
  latest.current = beats;
  useEffect(() => {
    if (stopped) return;
    let timers: number[] = [];
    const play = () => {
      timers = latest.current.map((b) => window.setTimeout(b.run, b.at));
      if (loop) timers.push(window.setTimeout(play, loop));
    };
    play();
    const el = root.current;
    const stop = (e: Event) => { if (e.isTrusted) setStopped(true); };
    el?.addEventListener("pointerdown", stop);
    el?.addEventListener("keydown", stop);
    return () => { timers.forEach(clearTimeout); el?.removeEventListener("pointerdown", stop); el?.removeEventListener("keydown", stop); };
  }, [stopped, loop]);
  return root;
}
