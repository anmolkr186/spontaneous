/**
 * The agent panel's pieces around the thread, wired to the app:
 *
 *   AgentComposerBar  the Chat composer: model and effort from your Claude Code, frames and notes as context
 *   AgentAbove        while a plan runs, Agent steering; on a long run, the Agent monitor; otherwise the queue
 *   AgentMenu         the panel's "⋯": play a demo run, agent permissions, context
 *   useAgentActions   what thread parts can do here: seek, undo a change, open a note, ask again
 */
import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Ellipsis, Play, Shield, SquareStack } from "lucide-react";
import { IconKey, Key } from "@/ui/atoms";
import { ChatComposer } from "@/ui/organisms/chat-composer";
import type { ComposerAttachment, ComposerSendDetails } from "@/ui/organisms/chat-composer";
import type { EffortOption, PickerModel } from "@/ui/molecules/model-picker";
import { AgentQueue } from "@/ui/organisms/agent";
import type { AgentActions } from "@/ui/organisms/agent";
import { AgentSteering } from "@/ui/organisms/agent-steering";
import type { SteerStep } from "@/ui/organisms/agent-steering";
import { AgentMonitor } from "@/ui/organisms/agent-monitor";
import type { MonitorStep } from "@/ui/organisms/agent-monitor";
import { AutonomyDial } from "@/ui/organisms/autonomy-dial";
import { ContextWindow } from "@/ui/organisms/context-window";
import type { ContextPart } from "@/ui/organisms/context-window";
import { STEP_TOOLS } from "./apply";
import { AGENT_EFFORTS, AGENT_MODELS, effortLabel } from "./agent-stream";
import { useAgent } from "./agent";
import { useChanges } from "./changes";
import { formatTime } from "./model";
import { useEditor } from "./store";
import styles from "./agent-panel.module.css";

/* ───────────────────────── Actions ───────────────────────── */

export function useAgentActions(): AgentActions {
  return useMemo(() => ({
    seek: (at) => useEditor.getState().seek(at),
    undo: (toolCallId) => useAgent.getState().undo(toolCallId),
    undoEntry: (id) => useChanges.getState().undo([id]),
    openNote: (id) => { useEditor.getState().setSide("notes"); useEditor.getState().select(id); },
    regenerate: () => useAgent.getState().regenerate(),
  }), []);
}

/* ───────────────────────── Composer ───────────────────────── */

/** Meters for model families the app knows; anything else shows without them. */
const FAMILY: Record<string, Pick<PickerModel, "speed" | "quality" | "cost">> = {
  opus: { speed: 2, quality: 5, cost: 4 }, sonnet: { speed: 4, quality: 4, cost: 2 }, haiku: { speed: 5, quality: 3, cost: 1 }, fable: { speed: 3, quality: 5, cost: 5 },
};
const family = (value: string, name: string) => Object.entries(FAMILY).find(([f]) => value.includes(f) || name.toLowerCase().includes(f))?.[1];

/** The prompt as the agent receives it: what you typed, then what you attached. */
function withAttachments(text: string, attachments: ComposerAttachment[]): string {
  const lines = attachments.map((a) =>
    a.kind === "frame" ? `[Frame at ${formatTime(a.at ?? 0)}]`
    : a.kind === "region" ? `[Area on the frame at ${formatTime(a.at ?? 0)}]`
    : a.kind === "note" ? `[Note ${a.index ?? ""} at ${formatTime(a.at ?? 0)}: ${a.label ?? ""}]`
    : `[File: ${a.label ?? "attached"}]`);
  return [text, ...lines].filter(Boolean).join("\n");
}

export function AgentComposerBar() {
  const running = useAgent((s) => s.running);
  const catalog = useAgent((s) => s.catalog);
  const modelChoice = useAgent((s) => s.modelChoice);
  const effortChoice = useAgent((s) => s.effortChoice);
  const time = useEditor((s) => s.time);
  const { send, cancel, setModelChoice, setEffortChoice } = useAgent.getState();

  const models: PickerModel[] = catalog
    ? catalog.map((m) => ({ id: m.value, name: m.displayName, description: m.description, ...family(m.value, m.displayName) }))
    : AGENT_MODELS.map((m) => ({ id: m.value, name: m.label, ...family(m.value, m.label) }));
  const current = catalog?.find((m) => m.value === (modelChoice ?? "default"));
  const levels = current ? current.supportedEffortLevels ?? [] : AGENT_EFFORTS.filter((e) => e.value !== "default").map((e) => e.value);
  const efforts: EffortOption[] = levels.map((l) => ({ value: l, label: effortLabel(l) }));
  const canThink = efforts.length > 0 && current?.supportsEffort !== false;

  /** A note attached from the panel is the selected one, or the one nearest the playhead. */
  const onAttach = (kind: ComposerAttachment["kind"]): ComposerAttachment | null => {
    const { project, selection } = useEditor.getState();
    const notes = project.notes.filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);
    if (kind === "note") {
      const note = notes.find((n) => n.id === selection) ?? [...notes].sort((a, b) => Math.abs(a.at - time) - Math.abs(b.at - time))[0];
      return note ? { id: `note-${note.id}`, kind: "note", at: note.at, label: note.text, index: notes.indexOf(note) + 1 } : null;
    }
    if (kind === "file") return null;
    return { id: `${kind}-${Math.round(time * 10)}`, kind, at: time };
  };

  return (
    <ChatComposer
      running={running}
      onStop={cancel}
      onSend={(text: string, details: ComposerSendDetails) => send(withAttachments(text, details.attachments))}
      onAttach={onAttach}
      playhead={time}
      models={models}
      model={modelChoice ?? "default"}
      onModelChange={(id) => setModelChoice(id === "default" ? null : id)}
      thinking={canThink ? effortChoice !== null : false}
      onThinkingChange={(on) => setEffortChoice(on ? (levels.includes("medium") ? "medium" : levels[0] ?? null) : null)}
      effort={effortChoice ?? "medium"}
      onEffortChange={(e) => setEffortChoice(e)}
      efforts={canThink ? efforts : []}
      voice={false} systemInput={false}
      meta={<ContextKey />}
      placeholder="Ask the agent, or describe an edit…"
    />
  );
}

/* ───────────────────────── Above the composer ───────────────────────── */

type RunStep = { id: string; title: string; tool: string; status: "pending" | "running" | "done" | "failed"; duration?: number };

type RunningPlan = { title: string; steps: RunStep[]; startedAt?: number } | null;

/** The plan that's running right now, if any: its title, steps and start. Selected as JSON so it only re-renders on change. */
function useRunningPlan(): RunningPlan {
  const json = useAgent((s) => JSON.stringify(((): RunningPlan => {
    for (const m of [...s.messages].reverse()) {
      if (typeof m.content === "string") continue;
      for (const p of m.content) {
        if (p.type !== "tool-call" || p.toolName !== "propose_plan") continue;
        const r = p.result as { status?: string; steps?: RunStep[]; startedAt?: number } | undefined;
        if (r?.status === "running") return { title: (p.args as { title?: string }).title ?? "Plan", steps: r.steps ?? [], startedAt: r.startedAt };
      }
    }
    return null;
  })()));
  return useMemo(() => JSON.parse(json) as RunningPlan, [json]);
}

/** Re-renders every second while `on`, for clocks that cross a threshold. */
function useTick(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

/** The monitor takes over once a run has gone on this long. */
const LONG_RUN_MS = 20_000;

export function AgentAbove() {
  const queue = useAgent((s) => s.queue);
  const running = useAgent((s) => s.running);
  const since = useAgent((s) => s.runStartedAt);
  const usage = useAgent((s) => s.usage);
  const waiting = useAgent((s) => s.messages.at(-1)?.status?.type === "requires-action");
  const { send, cancel, dequeue } = useAgent.getState();
  const plan = useRunningPlan();
  const now = useTick(running && !!since);
  const stepsJson = useAgent((s) => {
    const last = s.messages.at(-1);
    if (!last || last.role !== "assistant" || typeof last.content === "string") return "[]";
    return JSON.stringify(last.content.flatMap((p): MonitorStep[] => (p.type === "tool-call" && !(p.artifact as { block?: string } | undefined)?.block
      ? [{ id: p.toolCallId ?? p.toolName, label: p.toolName.replace(/_/g, " "), state: p.result === undefined ? "running" : "done" }]
      : [])));
  });
  const toolSteps = useMemo(() => JSON.parse(stepsJson) as MonitorStep[], [stepsJson]);

  const notes = queue.filter((q) => q.text).map((q) => ({ id: q.id, text: q.text! }));
  if (plan) {
    const steps: SteerStep[] = plan.steps.map((s) => ({ id: s.id, title: s.title, status: s.status === "done" || s.status === "failed" ? "done" : s.status === "running" ? "active" : "pending", duration: s.duration }));
    return (
      <AgentSteering title={plan.title} agent="Claude Code" steps={steps} queue={notes} status="running" startedAt={plan.startedAt}
        onQueue={(text) => send(text)} onInterrupt={(text) => { cancel(); send(text); }} onRemove={dequeue} />
    );
  }
  if (running && since && now - since > LONG_RUN_MS) {
    return (
      <AgentMonitor state="running" agent={{ name: "Claude Code" }} steps={toolSteps} since={since} cost={usage?.cost || undefined}
        current={{ label: toolSteps.some((s) => s.state === "running") ? "Working through the steps" : "Writing the reply" }}
        defaultFolded onCancel={cancel} />
    );
  }
  return <AgentQueue items={queue} waiting={waiting} onRemove={dequeue} />;
}

/* ───────────────────────── Context ───────────────────────── */

/** The agent's instructions, in tokens: about 6.7k characters of ours. Claude Code adds its own on top. */
const INSTRUCTIONS_TOKENS = 1700;
const tokens = (text: string) => Math.ceil(text.length / 4);

function useContextParts(): { parts: ContextPart[]; used: number; measured: boolean } {
  const usage = useAgent((s) => s.usage);
  const project = useEditor((s) => s.project);
  const messages = useAgent((s) => s.messages.length);
  const outline = tokens(JSON.stringify({ notes: project.notes, zooms: project.zooms, overlays: project.overlays }));
  const notes = project.notes.filter((n) => n.status !== "dismissed");
  const total = usage ? usage.input + usage.cacheRead : 0;
  const conversation = Math.max(0, total - INSTRUCTIONS_TOKENS - outline) || messages * 220;
  const parts: ContextPart[] = [
    { id: "instructions", label: "Instructions", tokens: INSTRUCTIONS_TOKENS, locked: true },
    { id: "outline", label: "Project outline", tokens: outline, locked: true },
    { id: "notes", label: "Your notes", tone: "ink", items: notes.map((n) => ({ id: n.id, label: n.text || "Marked area", tokens: tokens(n.text) + 12, at: n.at })) },
    { id: "conversation", label: "Conversation", tokens: conversation, compact: true },
  ];
  return { parts, used: parts.reduce((sum, p) => sum + (p.tokens ?? p.items?.reduce((a, i) => a + i.tokens, 0) ?? 0), 0), measured: !!usage };
}

function ContextPanel() {
  const { parts, measured } = useContextParts();
  const model = useAgent((s) => s.model);
  const { send, reset } = useAgent.getState();
  return (
    <ContextWindow parts={parts} limit={200_000} model={model ?? undefined} title={measured ? "Context" : "Context (estimate)"}
      onCompact={() => send("/compact")} action={{ label: "New chat", onClick: reset }} />
  );
}

/** The usage figure in the composer row; opens the Context window. */
function ContextKey() {
  const { used } = useContextParts();
  const label = used >= 1000 ? `${(used / 1000).toFixed(used >= 10_000 ? 0 : 1)}k` : String(used);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Key size="sm" variant="tertiary" aria-label={`Context: about ${used} tokens. Open the context window`}>{label}</Key>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={8} collisionPadding={12} className={styles.popover}><ContextPanel /></Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ───────────────────────── Menu ───────────────────────── */

const ACTIONS = Object.entries(STEP_TOOLS).map(([id, t]) => ({ id, label: t.label, detail: t.detail, risk: t.risk }));

/** The panel's "⋯": a demo run, what the agent may do without asking, and what fills its context. */
export function AgentMenu() {
  const [view, setView] = useState<"menu" | "permissions" | "context" | null>(null);
  const autonomy = useAgent((s) => s.autonomy);
  const { playDemo, setAutonomy } = useAgent.getState();
  return (
    <Popover.Root open={view !== null} onOpenChange={(open) => setView(open ? "menu" : null)}>
      <Popover.Trigger asChild>
        <IconKey label="Agent options" size="sm" tooltip="bottom"><Ellipsis /></IconKey>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={styles.popover}>
          {view === "menu" && (
            <div className={styles.menu} role="menu" aria-label="Agent options">
              <button type="button" role="menuitem" className={styles.item} onClick={() => { setView(null); playDemo(); }}><Play />Play a demo run<span>Shows every agent card, without using Claude Code</span></button>
              <button type="button" role="menuitem" className={styles.item} onClick={() => setView("permissions")}><Shield />Agent permissions<span>What it may apply without asking</span></button>
              <button type="button" role="menuitem" className={styles.item} onClick={() => setView("context")}><SquareStack />Context<span>What fills the agent's context</span></button>
            </div>
          )}
          {view === "permissions" && (
            <AutonomyDial title="Claude Code" subtitle="What it may apply from a plan without asking you" actions={ACTIONS}
              level={autonomy.level} onLevelChange={(level) => setAutonomy({ level })} pinned={autonomy.pinned} onPinnedChange={(pinned) => setAutonomy({ pinned })} />
          )}
          {view === "context" && <ContextPanel />}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
