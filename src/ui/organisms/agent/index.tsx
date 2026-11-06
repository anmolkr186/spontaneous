import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Composer, Message, Thread, When, useThreadState } from "./runtime";
import type { ReasoningMessagePartComponent, TextMessagePartComponent, ToolCallMessagePartComponent } from "./runtime";
import { ArrowUp, Check, ChevronDown, ChevronRight, Circle, Clock3, Minus, Square, X } from "lucide-react";
import { IconKey, Kbd, Key, Mark, RollText } from "@/ui/atoms";
import { useCtaRole } from "@/ui/cta";
import type { CtaIntent } from "@/ui/cta";
import { formatTime } from "@/editor/model";
import { visibleText } from "@/editor/agent-stream";
import { ThinkingLoader } from "@/ui/molecules/thinking-loader";
import { MessageActions } from "@/ui/molecules/message-actions";
import { toast } from "@/ui/organisms/toaster";
import { AgentActionsContext, BLOCK_RENDERERS, ToolGroupPart, ToolPart, block } from "./parts";
import type { AgentActions } from "./parts";
import styles from "./agent.module.css";

export { AgentActionsContext };
export type { AgentActions };

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
  /** Replaces the built-in composer, e.g. with a Chat composer wired to the app. */
  composer?: ReactNode;
  /** Sits between the thread and the suggestions, e.g. the Agent monitor or Agent steering. */
  above?: ReactNode;
  /** What parts can do in the app: seek, undo by entry, regenerate, open a note. */
  actions?: AgentActions;
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
export function AgentThread({ suggestions, queue, empty, composerMeta, tools, onUndo, composer, above, actions }: AgentThreadProps) {
  return (
    <AgentActionsContext.Provider value={{ undo: onUndo, ...actions }}>
    <UndoContext.Provider value={onUndo}>
      <Thread.Root className={styles.thread}>
        <Thread.Viewport className={styles.viewport} turnAnchor="bottom">
          <When condition={(s) => s.thread.isEmpty}>{empty ?? <AgentEmpty />}</When>
          <Thread.Messages>
            {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage tools={tools} />)}
          </Thread.Messages>
          <Thread.ViewportFooter className={styles.footer}>
            {queue}
            {above}
            {suggestions}
            {composer ?? <AgentComposer meta={composerMeta} />}
          </Thread.ViewportFooter>
        </Thread.Viewport>
      </Thread.Root>
    </UndoContext.Provider>
    </AgentActionsContext.Provider>
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

export interface CliUpdateNoticeProps {
  installed: string;
  latest: string;
  state: { status: "idle" | "updating" } | { status: "updated"; version: string } | { status: "failed"; error: string };
  onUpdate: () => void;
  onDismiss: () => void;
  /** Floats under the title bar. Off for showing it in place, as the docs do. */
  floating?: boolean;
}

/** A newer Claude Code is out. Floats under the title bar until updated or dismissed. */
export function CliUpdateNotice({ installed, latest, state, onUpdate, onDismiss, floating = true }: CliUpdateNoticeProps) {
  const updating = state.status === "updating";
  return (
    <section role="status" aria-label="Claude Code update" className={styles.update} data-floating={floating || undefined}>
      <div className={styles.updateHead}>
        <Mark size={14} title="" />
        <span className={styles.updateTitle}>Claude Code update</span>
        <IconKey label="Dismiss" size="sm" disabled={updating} onClick={onDismiss}><X /></IconKey>
      </div>
      <div className={styles.updateRow}>
        {state.status === "updated" ? (
          <span className={styles.updateDone}><Check size={13} />Updated to {state.version}</span>
        ) : (
          <>
            <span className={styles.updateVersions}>{installed} → {latest}</span>
            <Key size="sm" variant="primary" disabled={updating} onClick={onUpdate}>
              {updating ? "Updating…" : state.status === "failed" ? "Retry" : "Update"}
            </Key>
          </>
        )}
      </div>
      {state.status === "failed" && <p role="alert" className={styles.updateError}>{state.error}</p>}
      <p className={styles.updateNote}>
        {state.status === "updated" ? "Your next message runs on the new version." : "New models often need the latest version."}
      </p>
    </section>
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
        {running && empty && <ThinkingLoader variant="plain" size="sm" phases={["Thinking", "Reading your notes", "Writing"]} interval={2600} />}
        <Message.Parts
          components={{
            Text: AgentText,
            Reasoning: AgentReasoning,
            ToolGroup: ToolGroupPart,
            tools: { by_name: { ask_user: AskBlock, apply_notes: NotesPlan, ...BLOCK_RENDERERS, ...tools }, Fallback: ToolPart },
          }}
        />
        <ReplyActions />
      </div>
    </Message.Root>
  );
}

/** Streamed text. A UI block's opening fence still arriving is held back, so it never flashes. */
export const AgentText: TextMessagePartComponent = ({ text, status }) => {
  const shown = status.type === "running" ? visibleText(text) : text;
  if (!shown) return null;
  return <p className={[styles.text, status.type === "running" ? styles.cursorBlink : ""].join(" ")}>{shown}</p>;
};

/** Under a finished reply: copy, ask again (on the latest), and rate it. */
function ReplyActions() {
  const { regenerate } = useContext(AgentActionsContext);
  const done = useThreadState((s) => s.message.status?.type === "complete");
  const text = useThreadState((s) => s.message.content.map((p) => (p.type === "text" ? p.text : "")).join("\n").trim());
  const last = useThreadState((s) => s.thread.messages.at(-1)?.id === s.message.id);
  if (!done || !text) return null;
  return (
    <MessageActions text={text} label="Reply actions" actions={last && regenerate ? ["copy", "regenerate", "feedback"] : ["copy", "feedback"]}
      onCopy={() => toast("Copied")} onRegenerate={regenerate} />
  );
}

/** Collapsed thinking. Shimmers while streaming; opens on click to a quoted block. */
export const AgentReasoning: ReasoningMessagePartComponent = ({ text, status }) => {
  const [open, setOpen] = useState(false);
  const running = status.type === "running";
  // Claude Code can open a thinking block and leave it empty; there's nothing to show.
  if (!running && !text.trim()) return null;
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

/** ask_user as the thread renders it: a loader while the agent writes the question. */
const AskBlock = block<Partial<AskArgs>>(({ args, result, answer }) => (
  <AskCardView question={args.question ?? ""} options={Array.isArray(args.options) ? args.options : []} answer={result?.answer as string | undefined} onAnswer={(o) => answer({ answer: o })} />
));

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
          <SendKey />
        </When>
        <When condition={(s) => s.thread.isRunning}>
          <Composer.Cancel className={styles.send} aria-label="Stop"><Square size={11} fill="currentColor" /></Composer.Cancel>
        </When>
      </div>
    </Composer.Root>
  );
}

/** Send is the panel's run action: primary once there's something to send, unless a decision is waiting. */
function SendKey() {
  const empty = useThreadState((s) => s.composer.isEmpty);
  const role = useCtaRole("run", !empty);
  return <Composer.Send className={styles.send} data-role={role} aria-label="Send"><ArrowUp /></Composer.Send>;
}

/* ───────────────────────── Suggestions ───────────────────────── */

export interface Suggestion {
  id: string;
  label: string;
  onSelect: () => void;
  /** Give a suggestion an intent and it competes for the region's primary: "Apply 3 notes" is a run. Others stay quiet. */
  intent?: CtaIntent;
}

/** Quiet one-tap prompts above the composer. One with an intent can rise to the light face when it's the most useful thing to do. */
export function SuggestionChips({ items }: { items: Suggestion[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.suggestions}>
      {items.map((s) => <SuggestionChip key={s.id} item={s} />)}
    </div>
  );
}

function SuggestionChip({ item }: { item: Suggestion }) {
  const role = useCtaRole(item.intent ?? "navigate", !!item.intent, "secondary");
  return <button type="button" className={styles.suggestion} data-role={item.intent ? role : undefined} onClick={item.onSelect}><RollText text={item.label} /></button>;
}

export { styles as agentStyles };
