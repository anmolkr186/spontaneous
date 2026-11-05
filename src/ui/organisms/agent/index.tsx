import { createContext, useContext, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { Composer, Message, Thread, When, useThreadState } from "./runtime";
import type { ReasoningMessagePartComponent, TextMessagePartComponent, ToolCallMessagePartComponent, ToolCallMessagePartProps } from "./runtime";
import { ArrowUp, Check, ChevronDown, ChevronRight, Circle, Clock3, Crosshair, Eye, Film, Gauge, Minus, Scissors, Search, Square, Type, Wand2, X, ZoomIn } from "lucide-react";
import { Kbd, Key, Mark } from "@/ui/atoms";
import { formatTime } from "@/editor/model";
import styles from "./agent.module.css";

/* ───────────────────────── Thread ───────────────────────── */

export interface AgentThreadProps {
  /** Rendered above the composer, e.g. suggestion chips. */
  suggestions?: ReactNode;
  /** Runs waiting their turn, shown between the thread and the composer. */
  queue?: ReactNode;
  /** Shown when the thread has no messages. */
  empty?: ReactNode;
  composerMeta?: ReactNode;
  /** Per-tool renderers; anything else falls back to a step row. */
  tools?: Record<string, ToolCallMessagePartComponent>;
  /** Reverts one edit. Steps whose result carries `undo` get an Undo action. */
  onUndo?: (toolCallId: string) => void;
}

const UndoContext = createContext<((toolCallId: string) => void) | undefined>(undefined);

/**
 * The agent conversation. Scrolling, streaming, cancel and keyboard behavior
 * come from the thread runtime; this file supplies the look and the renderers
 * for each kind of message part.
 *
 * A reply reads top to bottom as: reasoning (collapsed), the steps it took on
 * one rail, then the result in plain text. A batch of notes adds a checklist.
 */
export function AgentThread({ suggestions, queue, empty, composerMeta, tools, onUndo }: AgentThreadProps) {
  return (
    <UndoContext.Provider value={onUndo}>
      <Thread.Root className={styles.thread}>
        <Thread.Viewport className={styles.viewport} turnAnchor="bottom">
          <When condition={(s) => s.thread.isEmpty}>{empty ?? <AgentEmpty />}</When>
          <Thread.Messages>
            {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage tools={tools} />)}
          </Thread.Messages>
          <Thread.ViewportFooter className={styles.footer}>
            {queue}
            {suggestions}
            <AgentComposer meta={composerMeta} />
          </Thread.ViewportFooter>
        </Thread.Viewport>
      </Thread.Root>
    </UndoContext.Provider>
  );
}

export function AgentEmpty({ children = "Leave notes on the frame and the agent turns them into zooms, callouts, cuts and timing." }: { children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Mark size={40} title="" />
      <h3>Mark it, say it, done</h3>
      <p>{children}</p>
    </div>
  );
}

export interface AgentConnectProps {
  phase: "checking" | "missing" | "signed-out" | "signing-in";
  error?: string;
  onSignIn: () => void;
  onCheck: () => void;
}

/** Stands in for the thread until the user's own Claude Code is installed and signed in. */
export function AgentConnect({ phase, error, onSignIn, onCheck }: AgentConnectProps) {
  if (phase === "checking") return <div className={styles.empty}><p>Checking for Claude Code…</p></div>;
  const copy = {
    missing: { title: "Install Claude Code", body: "Spontaneous runs your own copy of Claude Code. Install it from code.claude.com, then check again." },
    "signed-out": { title: "Connect Claude Code", body: "Work through your notes on your own Claude plan. You sign in on Anthropic's page in your browser, and Spontaneous never sees your login." },
    "signing-in": { title: "Finish signing in", body: "Complete the sign-in in your browser, then come back here." },
  }[phase];
  return (
    <div className={styles.empty}>
      <Mark size={40} title="" />
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      {error && <p className={styles.connectError}>{error}</p>}
      <div className={styles.connectActions}>
        {phase === "signed-out" && <Key size="sm" variant="primary" onClick={onSignIn}>Sign in</Key>}
        {phase === "signing-in" && <Key size="sm" variant="tertiary" onClick={onSignIn}>Open sign-in again</Key>}
        {phase !== "signed-out" && <Key size="sm" variant={phase === "missing" ? "primary" : "tertiary"} onClick={onCheck}>Check again</Key>}
      </div>
    </div>
  );
}

/* ───────────────────────── Messages ───────────────────────── */

/** A note as the thread knows it: its pin number, time and text. */
export type ThreadNote = { id: string; index: number; at: number; text: string };

/** The note's pin: the same skewed ink cell as on the frame and in the Notes list. */
export function NotePin({ index, muted }: { index: number; muted?: boolean }) {
  return <span className={styles.pin} data-muted={muted || undefined}>{index}</span>;
}

const UserText: TextMessagePartComponent = ({ text }) => <>{text}</>;

export function UserMessage() {
  const notes = useThreadState((s) => (s.message.metadata?.custom as { notes?: ThreadNote[] } | undefined)?.notes);
  return (
    <Message.Root className={styles.user}>
      {notes?.length ? (
        <span className={styles.noteRef}>
          {notes.map((n) => <NotePin key={n.id} index={n.index} />)}
          {notes.length === 1 ? <>Note at <span className={styles.time}>{formatTime(notes[0]!.at)}</span></> : `${notes.length} notes`}
        </span>
      ) : null}
      <div className={styles.userBubble}>
        <Message.Parts components={{ Text: UserText }} />
      </div>
    </Message.Root>
  );
}

export function AssistantMessage({ tools }: { tools?: Record<string, ToolCallMessagePartComponent> }) {
  const status = useThreadState((s) => s.message.status);
  const empty = useThreadState((s) => s.message.content.length === 0);
  const running = status?.type === "running";
  const stopped = status?.type === "incomplete" && status.reason === "cancelled";
  return (
    <Message.Root className={styles.assistant}>
      <div className={styles.byline}>
        <Mark size={14} title="" />
        <span>Spontaneous</span>
        {running && <span className={styles.shimmer}>Working</span>}
        {stopped && <span className={styles.stopped}>Stopped</span>}
      </div>
      <div className={styles.assistantBody}>
        {running && empty && <span className={styles.placeholder}><span className={styles.shimmer}>Thinking</span></span>}
        <Message.Parts
          components={{
            Text: AgentText,
            Reasoning: AgentReasoning,
            ToolGroup: Steps,
            tools: { by_name: { ask_user: AskCard, apply_notes: NotesPlan, ...tools }, Fallback: StepRow },
          }}
        />
      </div>
    </Message.Root>
  );
}

export const AgentText: TextMessagePartComponent = ({ text, status }) => (
  <p className={[styles.text, status.type === "running" ? styles.cursorBlink : ""].join(" ")}>{text}</p>
);

/** Collapsed thinking. Shimmers while streaming; opens on click to a quoted block. */
export const AgentReasoning: ReasoningMessagePartComponent = ({ text, status }) => {
  const [open, setOpen] = useState(false);
  const running = status.type === "running";
  return (
    <div className={styles.reasoning}>
      <button type="button" className={styles.reasoningToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={running ? styles.shimmer : undefined}>{running ? "Thinking" : "Reasoning"}</span>
        <ChevronRight />
      </button>
      {open && <div className={styles.reasoningText}>{text}</div>}
    </div>
  );
};

/* ───────────────────────── Steps ───────────────────────── */

/** Consecutive tool calls share one rail, so a run reads as a single list of steps. */
function Steps({ children }: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  return <div className={styles.steps}>{children}</div>;
}

const TOOL_META: Record<string, { title: string; doing: string; icon: ReactNode; kind: "read" | "edit" }> = {
  get_project: { title: "Read the project", doing: "Reading the project", icon: <Search />, kind: "read" },
  get_input_events: { title: "Read clicks and focus", doing: "Reading clicks and focus", icon: <Crosshair />, kind: "read" },
  render_frame: { title: "Looked at the frame", doing: "Looking at the frame", icon: <Eye />, kind: "read" },
  add_zoom: { title: "Added a zoom", doing: "Adding a zoom", icon: <ZoomIn />, kind: "edit" },
  update_zoom: { title: "Adjusted a zoom", doing: "Adjusting a zoom", icon: <ZoomIn />, kind: "edit" },
  remove_zoom: { title: "Removed an auto zoom", doing: "Removing an auto zoom", icon: <ZoomIn />, kind: "edit" },
  add_overlay: { title: "Added an overlay", doing: "Adding an overlay", icon: <Type />, kind: "edit" },
  set_speed: { title: "Changed speed", doing: "Changing speed", icon: <Gauge />, kind: "edit" },
  cut: { title: "Cut a section", doing: "Cutting a section", icon: <Scissors />, kind: "edit" },
  set_shot: { title: "Changed the shot", doing: "Changing the shot", icon: <Film />, kind: "edit" },
  set_motion: { title: "Retuned the camera", doing: "Retuning the camera", icon: <Gauge />, kind: "edit" },
};

function summarize(name: string, args: Record<string, unknown>): string {
  const t = (v: unknown) => (typeof v === "number" ? formatTime(v) : String(v));
  if ("start" in args && "end" in args) {
    const extra = name === "add_zoom" ? ` · ${args.scale}×` : name === "set_speed" ? ` · ${args.speed}×` : "label" in args ? ` · ${args.label}` : "";
    return `${t(args.start)}–${t(args.end)}${extra}`;
  }
  if ("from" in args && "to" in args) return `${t(args.from)}–${t(args.to)}`;
  if (name === "set_shot") return String(args.shot);
  if (name === "set_motion") return `${args.speed}× speed · ${Math.round(Number(args.amount) * 100)}% movement`;
  return "";
}

/** One step: what the agent read or changed. Edits can be undone from here. */
export const StepRow: ToolCallMessagePartComponent = ({ toolName, toolCallId, args, result }: ToolCallMessagePartProps) => {
  const onUndo = useContext(UndoContext);
  const meta = TOOL_META[toolName] ?? { title: toolName.replace(/_/g, " "), doing: toolName.replace(/_/g, " "), icon: <Wand2 />, kind: "edit" as const };
  const done = result !== undefined;
  const r = result as { undo?: unknown; undone?: boolean } | undefined;
  return (
    <div className={styles.step} data-kind={meta.kind} data-done={done || undefined} data-undone={r?.undone || undefined}>
      <span className={styles.stepIcon}>{done ? meta.icon : <span className={styles.spinner} />}</span>
      <span className={styles.stepTitle}>{done ? meta.title : `${meta.doing}…`}</span>
      <span className={styles.stepArgs}>{summarize(toolName, (args ?? {}) as Record<string, unknown>)}</span>
      {r?.undone ? <span className={styles.undone}>Undone</span>
        : done && r?.undo && onUndo ? <button type="button" className={styles.undo} onClick={() => onUndo(toolCallId)}>Undo</button>
        : null}
    </div>
  );
};

/* ───────────────────────── Batch checklist ───────────────────────── */

type PlanStatus = "queued" | "applying" | "applied" | "open";
const PLAN_ICON: Record<PlanStatus, ReactNode> = {
  queued: <Circle />,
  applying: <span className={styles.spinner} />,
  applied: <Check />,
  open: <Minus />,
};

/** A batch of notes in one run: a row per note that ticks off as it lands. */
export const NotesPlan: ToolCallMessagePartComponent<{ notes: ThreadNote[]; statuses: Record<string, PlanStatus> }> = ({ args, status }) => {
  const notes = args.notes ?? [];
  const stopped = status.type === "incomplete";
  const statusOf = (id: string): PlanStatus => { const s = args.statuses?.[id] ?? "queued"; return stopped && s !== "applied" ? "open" : s; };
  const done = notes.filter((n) => statusOf(n.id) === "applied").length;
  return (
    <div className={styles.plan}>
      <div className={styles.planHead}>
        <span>{done === notes.length ? `Applied ${notes.length} notes` : stopped ? "Stopped" : `Applying ${notes.length} notes`}</span>
        <span className={styles.planCount}>{done} of {notes.length}</span>
      </div>
      <ol className={styles.planList}>
        {notes.map((n) => {
          const s = statusOf(n.id);
          return (
            <li key={n.id} className={styles.planRow} data-status={s}>
              <NotePin index={n.index} muted={s === "applied"} />
              <span className={styles.planText}>{n.text}</span>
              <span className={styles.planIcon} aria-label={s}>{PLAN_ICON[s]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/* ───────────────────────── Queue ───────────────────────── */

export interface QueueItem { id: string; label: string }

/** Runs waiting for the agent. Each can be dropped; they start in order. */
export function AgentQueue({ items, waiting, onRemove }: { items: QueueItem[]; waiting?: boolean; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className={styles.queue} aria-label="Queued">
      <span className={styles.queueHead}><Clock3 />{waiting ? "Queued until you answer" : "Up next"}</span>
      {items.map((q) => (
        <span key={q.id} className={styles.queueItem}>
          <span className={styles.queueLabel}>{q.label}</span>
          <button type="button" className={styles.queueRemove} aria-label={`Remove ${q.label} from the queue`} onClick={() => onRemove(q.id)}><X /></button>
        </span>
      ))}
    </div>
  );
}

export interface AskArgs { question: string; options: string[] }

/**
 * Steering: the agent pauses and asks. Answering resolves the tool call, which
 * the runtime sends back to the agent as the tool result.
 */
export function AskCardView({ question, options, answer, onAnswer }: AskArgs & { answer?: string; onAnswer: (option: string) => void }) {
  return (
    <div className={styles.ask}>
      <p className={styles.askQuestion}>{question}</p>
      <div className={styles.askOptions}>
        {options.map((o, i) => (
          <button key={o} type="button" className={styles.askOption} data-chosen={answer === o || undefined} disabled={answer !== undefined} onClick={() => onAnswer(o)}>
            <span>{o}</span>
            {answer === o ? <Check size={14} /> : <Kbd>{i + 1}</Kbd>}
          </button>
        ))}
      </div>
    </div>
  );
}

export const AskCard: ToolCallMessagePartComponent<AskArgs, { answer: string }> = ({ args, result, addResult }) => (
  <AskCardView question={args.question} options={args.options} answer={result?.answer} onAnswer={(answer) => addResult({ answer })} />
);

/* ───────────────────────── Composer ───────────────────────── */

export function AgentComposer({ meta, placeholder = "Ask the agent, or describe an edit…" }: { meta?: ReactNode; placeholder?: string }) {
  return (
    <Composer.Root className={styles.composer}>
      <Composer.Input className={styles.composerInput} placeholder={placeholder} rows={1} autoFocus={false} />
      <div className={styles.composerRow}>
        <div className={styles.composerMeta}>
          {meta ?? <span className={styles.model}>Claude Code<ChevronDown size={12} /></span>}
        </div>
        <When condition={(s) => !s.thread.isRunning}>
          <Composer.Send className={styles.send} aria-label="Send"><ArrowUp /></Composer.Send>
        </When>
        <When condition={(s) => s.thread.isRunning}>
          <Composer.Cancel className={styles.send} aria-label="Stop"><Square size={11} fill="currentColor" /></Composer.Cancel>
        </When>
      </div>
    </Composer.Root>
  );
}

/* ───────────────────────── Suggestions ───────────────────────── */

export interface Suggestion { id: string; label: string; onSelect: () => void }

export function SuggestionChips({ items }: { items: Suggestion[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.suggestions}>
      {items.map((s) => (
        <button key={s.id} type="button" className={styles.suggestion} onClick={s.onSelect}>{s.label}</button>
      ))}
    </div>
  );
}

export { styles as agentStyles };
