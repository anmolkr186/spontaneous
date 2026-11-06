/**
 * Renderers for the agent's tool-call parts. A part is either a real tool call
 * (the agent read or changed something) or a UI block the agent wrote in its
 * reply (src/editor/agent-stream.ts) standing in for a tool it doesn't have
 * yet. Both arrive in the same shape, so each renderer maps a payload onto one
 * library component and answers through the runtime's `addResult`, which the
 * app turns into the person's choice (src/editor/agent.ts).
 */
import { createContext, useContext, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { Crosshair, Eye, Film, Gauge, Scissors, Search, Type, Undo2, Wand2, ZoomIn } from "lucide-react";
import { IconKey, Key } from "@/ui/atoms";
import { ThinkingLoader } from "@/ui/molecules/thinking-loader";
import { ToolCall, ToolCallGroup } from "@/ui/molecules/tool-call";
import { ShotSuggestion } from "@/ui/molecules/shot-suggestion";
import type { ShotOption } from "@/ui/molecules/shot-suggestion";
import { ThinkingState } from "@/ui/organisms/thinking-state";
import type { ThinkingStep } from "@/ui/organisms/thinking-state";
import { AgentPlan } from "@/ui/organisms/agent-plan";
import type { PlanStep } from "@/ui/organisms/agent-plan";
import { ApprovalCard } from "@/ui/organisms/approval-card";
import type { ApprovalDetail, ApprovalRisk } from "@/ui/organisms/approval-card";
import { PermissionRequest } from "@/ui/organisms/permission-request";
import type { PermissionDecision, PermissionRisk } from "@/ui/organisms/permission-request";
import { InlineDiff } from "@/ui/organisms/inline-diff";
import { CitedAnswer } from "@/ui/organisms/cited-answer";
import type { CitedSegment, Moment } from "@/ui/organisms/cited-answer";
import { ParallelAttempts } from "@/ui/organisms/parallel-attempts";
import type { Attempt } from "@/ui/organisms/parallel-attempts";
import { approvalLabels, planLabel, shotLabel } from "@/ui/cta";
import type { CtaProposal } from "@/ui/cta";
import { useThreadState } from "./runtime";
import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from "./runtime";
import styles from "./agent.module.css";

/** What the thread's parts can do in the app. Provided by AgentThread's host. */
export interface AgentActions {
  /** Move the playhead. */
  seek?: (at: number) => void;
  /** Revert an edit a tool call made. */
  undo?: (toolCallId: string) => void;
  /** Revert a change by its Changes-tab entry. */
  undoEntry?: (entryId: string) => void;
  /** Open a note in the Notes tab. */
  openNote?: (noteId: string) => void;
  /** Send the last message again. */
  regenerate?: () => void;
}

export const AgentActionsContext = createContext<AgentActions>({});

/* ───────────────────────── Tool calls ───────────────────────── */

const READ_TOOLS = new Set(["get_project", "get_input_events", "render_frame", "get_annotations", "get_timeline_summary"]);

const TOOL_ICON: Record<string, ReactNode> = {
  get_project: <Search />, get_input_events: <Crosshair />, render_frame: <Eye />,
  add_zoom: <ZoomIn />, update_zoom: <ZoomIn />, remove_zoom: <ZoomIn />, add_overlay: <Type />,
  set_speed: <Gauge />, cut: <Scissors />, set_shot: <Film />, set_motion: <Gauge />,
};

type BlockState = "open" | "ready" | "invalid";
const blockOf = (artifact: unknown) => (artifact as { block?: BlockState } | undefined)?.block;

/** One real tool call, as a Tool call line. Edits keep an Undo beside them. */
export const ToolPart: ToolCallMessagePartComponent = ({ toolName, toolCallId, args, result, isError, status }: ToolCallMessagePartProps) => {
  const { undo } = useContext(AgentActionsContext);
  const r = result as { undo?: unknown; undone?: boolean; error?: string } | undefined;
  const failed = isError || !!r?.error;
  const state = result === undefined ? (status.type === "running" ? "running" : "failed") : failed ? "failed" : "done";
  return (
    <div className={styles.toolRow} data-undone={r?.undone || undefined}>
      <ToolCall name={toolName} status={state} icon={TOOL_ICON[toolName] ?? <Wand2 />} args={(args ?? {}) as Record<string, unknown>} result={result}
        error={failed ? r?.error ?? "The tool reported an error" : state === "failed" ? "Stopped before it finished" : undefined} />
      {!!r?.undo && !r.undone && undo && (
        <IconKey label="Undo this edit" size="sm" tooltip="left" className={styles.toolUndo} onClick={() => undo(toolCallId)}><Undo2 /></IconKey>
      )}
    </div>
  );
};

type GroupTool = { id: string; name: string; args: Record<string, unknown>; result: unknown; isError?: boolean; block?: BlockState };

/** Consecutive tool calls: reading becomes a Thinking state, anything else a Tool call group. UI blocks are never folded away. */
export function ToolGroupPart({ startIndex, endIndex, children }: { startIndex: number; endIndex: number; children?: ReactNode }) {
  // Selected as JSON: the runtime needs a stable snapshot, and a slice is a new array every time.
  const json = useThreadState((s) => JSON.stringify(s.message.content.slice(startIndex, endIndex + 1).flatMap((p): GroupTool[] =>
    p.type === "tool-call" ? [{ id: p.toolCallId ?? p.toolName, name: p.toolName, args: (p.args ?? {}) as Record<string, unknown>, result: p.result, isError: p.isError, block: blockOf(p.artifact) }] : [])));
  const tools = useMemo(() => JSON.parse(json) as GroupTool[], [json]);
  const running = useThreadState((s) => s.message.status?.type === "running");
  const { seek, undo } = useContext(AgentActionsContext);
  if (tools.some((p) => p.block || BLOCK_RENDERERS[p.name])) return <>{children}</>;
  if (tools.length && tools.every((p) => READ_TOOLS.has(p.name))) {
    const steps: ThinkingStep[] = tools.map((p) => ({ id: p.id, label: READ_LABEL[p.name] ?? p.name, moments: momentsOf(p.id, p.args) }));
    const done = tools.every((p) => p.result !== undefined);
    const active = Math.max(0, tools.findIndex((p) => p.result === undefined));
    return <ThinkingState steps={steps} activeIndex={done ? steps.length - 1 : active} done={done || !running} label="Reading" doneLabel="Read the project" onSeek={seek} defaultOpen={!done} />;
  }
  // The group reads its summary from its children, so they're Tool calls built from the parts themselves.
  const undoable = tools.filter((p) => { const r = p.result as { undo?: unknown; undone?: boolean } | undefined; return !!r?.undo && !r.undone; });
  return (
    <>
      <ToolCallGroup>
        {tools.map((p) => {
          const r = p.result as { error?: string } | undefined;
          const failed = p.isError || !!r?.error;
          const status = p.result === undefined ? (running ? "running" : "failed") : failed ? "failed" : "done";
          return <ToolCall key={p.id} name={p.name} status={status} icon={TOOL_ICON[p.name] ?? <Wand2 />} args={p.args} result={p.result}
            error={failed ? r?.error ?? "The tool reported an error" : status === "failed" ? "Stopped before it finished" : undefined} />;
        })}
      </ToolCallGroup>
      {undoable.length > 0 && undo && (
        <span className={styles.groupUndo}>
          <Key size="sm" variant="tertiary" onClick={() => undoable.forEach((p) => undo(p.id))}><Undo2 />{undoable.length === 1 ? "Undo this edit" : `Undo these ${undoable.length} edits`}</Key>
        </span>
      )}
    </>
  );
}

const READ_LABEL: Record<string, string> = { get_project: "Reading the project", get_input_events: "Finding the clicks", render_frame: "Looking at the frame", get_annotations: "Reading your notes", get_timeline_summary: "Reading the timeline" };

function momentsOf(id: string, args: Record<string, unknown> | undefined) {
  const at = typeof args?.at === "number" ? args.at : typeof args?.from === "number" ? args.from : typeof args?.t === "number" ? args.t : undefined;
  return at === undefined ? undefined : [{ id: `${id}-m`, at, label: typeof args?.to === "number" ? "Clicks and focus" : "Frame" }];
}

/* ───────────────────────── UI blocks ───────────────────────── */

const DRAFTING: Record<string, string> = {
  propose_plan: "Drafting a plan", suggest_shot: "Choosing a shot", propose_text_edit: "Rewriting the text", answer_with_moments: "Writing the answer",
  request_approval: "Asking first", request_permission: "Asking for access", try_variants: "Comparing versions", ask_user: "Writing a question", reply_to_note: "Replying on the note",
};

export type BlockProps<A> = { args: A; result: Record<string, unknown> | undefined; answer: (result: Record<string, unknown>) => void; id: string; running: boolean };

/** Wraps a block renderer: a loader while the block streams, a quiet line if it can't be read. */
export function block<A>(Component: ComponentType<BlockProps<A>>): ToolCallMessagePartComponent {
  return function Block({ toolName, toolCallId, args, result, artifact, addResult, status }: ToolCallMessagePartProps) {
    const state = blockOf(artifact);
    if (state === "open") return <ThinkingLoader variant="plain" size="sm" phases={[DRAFTING[toolName] ?? "Writing"]} />;
    if (state === "invalid") return <p className={styles.blockError}>Couldn't read the agent's {toolName.replace(/^(propose|request|suggest|answer|try|reply)_/, "").replace(/_/g, " ")}.</p>;
    return <Component args={args as A} result={result as Record<string, unknown> | undefined} answer={(r) => addResult(r)} id={toolCallId ?? toolName} running={status.type === "running"} />;
  };
}

type PlanArgs = { title?: string; estimate?: string; steps?: { id: string; title: string; tool: string; args?: Record<string, unknown> }[]; cta?: CtaProposal };
const STEP_NAME: Record<string, string> = { add_zoom: "Zoom", add_overlay: "Callout", set_shot: "Shot", set_motion: "Camera", remove_zoom: "Zoom", cut: "Cut", set_speed: "Speed" };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The agent's edit plan: review it, run it, watch it apply. */
const PlanBlock = block<PlanArgs>(({ args, result, answer }) => {
  const proposed = Array.isArray(args.steps) ? args.steps : [];
  const ran = result?.steps as (PlanStep & { tool: string; args?: Record<string, unknown> })[] | undefined;
  const toStep = (s: { id: string; title: string; tool: string; args?: Record<string, unknown> }, extra?: Partial<PlanStep>): PlanStep => ({
    id: s.id, title: s.title, tool: STEP_NAME[s.tool] ?? s.tool, from: num(s.args?.start) ?? num(s.args?.at), to: num(s.args?.end), ...extra,
  });
  if (result?.action === "cancel") return <p className={styles.blockNote}>Plan set aside: {args.title ?? "untitled"}.</p>;
  const steps = ran ? ran.map((s) => toStep(s, { status: s.status, duration: s.duration, startedAt: s.startedAt, error: s.error })) : proposed.map((s) => toStep(s));
  return (
    <AgentPlan title={args.title ?? "Plan"} estimate={args.estimate} cta={args.cta}
      steps={ran ? steps : undefined} defaultSteps={ran ? undefined : steps}
      status={!ran ? "draft" : result?.status === "done" ? "done" : "running"} startedAt={num(result?.startedAt)}
      onRun={(order) => answer({ action: "run", steps: order.map((s) => ({ id: s.id, title: s.title })), said: planLabel("draft", order.length) })}
      onCancel={ran ? undefined : () => answer({ action: "cancel", said: "Not now" })}
      onRetry={(stepId) => answer({ action: "retry", from: stepId, said: planLabel("failed", steps.length, Math.max(0, steps.findIndex((s) => s.id === stepId))) })} />
  );
});

type ApprovalArgs = { title?: string; description?: string; risk?: ApprovalRisk; tool?: string; count?: number; details?: ApprovalDetail[]; cta?: CtaProposal };
const ApprovalBlock = block<ApprovalArgs>(({ args, result, answer }) => (
  <ApprovalCard title={args.title ?? "Approve this action"} description={args.description} risk={args.risk} tool={args.tool} count={args.count} cta={args.cta}
    details={Array.isArray(args.details) ? args.details : undefined}
    status={result ? (result.approved ? "approved" : "denied") : "pending"}
    onApprove={({ always }) => answer({ approved: true, always, said: approvalLabels(args.tool ?? "", args.count).approve })}
    onDeny={() => answer({ approved: false, said: approvalLabels(args.tool ?? "", args.count).deny })} />
));

type PermissionArgs = { action?: string; target?: string; risk?: PermissionRisk; reason?: string; preview?: { id: string; label: string; meta?: string }[]; cta?: CtaProposal };
const PermissionBlock = block<PermissionArgs>(({ args, result, answer }) => (
  <PermissionRequest action={args.action ?? "do this"} target={args.target} risk={args.risk ?? "risky"} reason={args.reason} cta={args.cta}
    preview={Array.isArray(args.preview) ? args.preview : undefined}
    decision={result ? ({ allow: !!result.allow, scope: (result.scope as PermissionDecision["scope"]) ?? "once", at: num(result.at) ?? Date.now(), until: num(result.until) } as PermissionDecision) : null}
    onDecisionChange={(d) => { if (d && !result) answer({ allow: d.allow, scope: d.scope, at: d.at, until: d.until, said: d.allow ? (d.scope === "once" ? "Allow once" : d.scope === "always" ? "Always allow" : "Allow for an hour") : "Deny" }); }} />
));

type TextArgs = { target?: string; label?: string; original?: string; suggested?: string; cta?: CtaProposal };
const TextEditBlock = block<TextArgs>(({ args, result, answer }) => {
  if (result) return <p className={styles.blockNote}>{args.label ?? "Text"}: kept “{String(result.text)}”.</p>;
  return <InlineDiff original={args.original ?? ""} suggested={args.suggested ?? ""} label={args.label} cta={args.cta}
    onDone={(text) => answer({ text, said: text === args.suggested ? "Accept all changes" : text === args.original ? "Keep the original" : "Keep my picks" })} />;
});

type ShotArgs = { context?: string; options?: ShotOption[]; cta?: CtaProposal };
const ShotBlock = block<ShotArgs>(({ args, result, answer }) => {
  const { undoEntry } = useContext(AgentActionsContext);
  const options = Array.isArray(args.options) ? args.options : [];
  return (
    <ShotSuggestion options={options} context={args.context} cta={args.cta}
      onAccept={(o) => { if (!result) answer({ used: o.id, said: shotLabel(o.label) }); }}
      onUndo={() => { if (typeof result?.entry === "string") undoEntry?.(result.entry); }} />
  );
});

type AnswerArgs = { segments?: CitedSegment[]; moments?: Moment[]; edits?: number; cta?: CtaProposal };
const AnswerBlock = block<AnswerArgs>(({ args, result, answer }) => {
  const { seek } = useContext(AgentActionsContext);
  return (
    <CitedAnswer segments={Array.isArray(args.segments) ? args.segments : []} moments={Array.isArray(args.moments) ? args.moments : []} edits={args.edits} cta={args.cta}
      onSeek={(at) => seek?.(at)} action={result ? undefined : { onClick: () => answer({ action: "apply", said: "Turn these into edits" }) }} />
  );
});

type VariantsArgs = { task?: string; attempts?: (Partial<Attempt> & { id: string; name: string })[] };
const VariantsBlock = block<VariantsArgs>(({ args, result, answer }) => {
  // The agent compared them already, so every attempt arrives finished.
  const attempts = (Array.isArray(args.attempts) ? args.attempts : []).map((a) => ({ ...a, status: a.status ?? "done", progress: 1 }) as Attempt);
  return <ParallelAttempts attempts={attempts} task={args.task} picked={(result?.picked as string | undefined) ?? undefined}
    onPick={(a) => { if (!result) answer({ picked: a.id, said: `Use ${a.name}` }); }} />;
});

type NoteReplyArgs = { note?: string; text?: string; status?: { label?: string } };
const NoteReplyBlock = block<NoteReplyArgs>(({ args }) => {
  const { openNote } = useContext(AgentActionsContext);
  return (
    <button type="button" className={styles.noteReply} onClick={() => args.note && openNote?.(args.note)}>
      <span>Replied on the note</span>
      <span className={styles.noteReplyText}>{args.status?.label ?? args.text}</span>
    </button>
  );
});

/** Every block but ask_user, which the thread wraps around its own Ask card. */
export const BLOCK_RENDERERS: Record<string, ToolCallMessagePartComponent> = {
  propose_plan: PlanBlock,
  request_approval: ApprovalBlock,
  request_permission: PermissionBlock,
  propose_text_edit: TextEditBlock,
  suggest_shot: ShotBlock,
  answer_with_moments: AnswerBlock,
  try_variants: VariantsBlock,
  reply_to_note: NoteReplyBlock,
};
