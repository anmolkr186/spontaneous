/**
 * AgentPlan: the agent's edit plan, to review before it runs.
 *
 * It reads as a card of numbered steps under the goal ("Tighten the Projects
 * walkthrough"). Each step says what the agent will do, which kind of edit it
 * is (a quiet tag) and where on the recording (a time range). In review you
 * can rename a step in place, drag it or move it with Alt ↑/↓, remove it, or
 * add one at the end; the tray says how many steps there are and roughly how
 * long they'll take, and holds Cancel and Run plan.
 *
 * Once it runs, editing folds away. Each number's hairline ring turns into
 * rays while its step works, then into a light cell with a check that draws
 * itself; the line on the left fills down to the next step. The tray's actions
 * give way to "Running · 2 of 5" with a live clock, then "Done in 14s". A step
 * that fails shows why, with "Retry from here".
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, Ref } from "react";
import { AnimatePresence, MotionConfig, Reorder, motion, useDragControls } from "motion/react";
import { GripVertical, ListChecks, Plus, RotateCcw, X } from "lucide-react";
import { DrawCheck, Duration, Fold, IconKey, Key, RaySpinner, RollNumber, Shimmer, Swap, Tag, Timecode, formatDuration } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import { motionTokens } from "@/ui/tokens/motion";
import { AutoHeight } from "@/ui/atoms";
import styles from "./agent-plan.module.css";

export type PlanStepStatus = "pending" | "running" | "done" | "failed";

export interface PlanStep {
  id: string;
  /** What the step does, in plain words: "Cut the dead air". */
  title: string;
  /** The kind of edit, by its human name: "Cut", "Zoom", "Speed", "Callout", "Camera". */
  tool?: string;
  /** Where it acts on the recording, in seconds. A moment on its own, or the start of a range. */
  from?: number;
  /** The end of the range, in seconds. */
  to?: number;
  /** Where the step is while the plan runs. Default "pending". */
  status?: PlanStepStatus;
  /** How long it took, in ms, once done or failed. */
  duration?: number;
  /** When it started (ms since epoch), so its clock ticks while it runs. */
  startedAt?: number;
  /** Why it failed, in a few words. */
  error?: string;
}

export type PlanStatus = "draft" | "running" | "done";

export interface AgentPlanProps {
  /** The goal of the plan. The heading of the card and the list's label. */
  title: string;
  /** Controlled steps. Pair with `onChange`. */
  steps?: PlanStep[];
  /** Initial steps when uncontrolled; edits are kept inside the component. */
  defaultSteps?: PlanStep[];
  /** Every edit in review: rename, reorder, remove, add. Gets the whole list in its new order. */
  onChange?: (steps: PlanStep[]) => void;
  /** Review and edit, running, or finished. Steps can only be edited in draft. */
  status?: PlanStatus;
  /** Run plan was pressed (or Run again once done). Gets the steps in their final order; set status to "running" here. */
  onRun?: (steps: PlanStep[]) => void;
  /** Shows Cancel next to Run plan. */
  onCancel?: () => void;
  /** Shows "Retry from here" under a failed step. */
  onRetry?: (stepId: string) => void;
  /** Rough run time shown in review, already formatted: "~40s". */
  estimate?: string;
  /** When the run started (ms since epoch). Defaults to the moment status turns "running". */
  startedAt?: number;
  className?: string;
}

/** Remembers the last thing to read out, keyed so the same words can be said twice. */
function useAnnouncer() {
  const [said, setSaid] = useState({ n: 0, text: "" });
  return [said, (text: string) => setSaid((s) => ({ n: s.n + 1, text }))] as const;
}

let nextId = 0;

export function AgentPlan({
  title,
  steps: controlled,
  defaultSteps = [],
  onChange,
  status = "draft",
  onRun,
  onCancel,
  onRetry,
  estimate,
  startedAt,
  className,
}: AgentPlanProps) {
  const [own, setOwn] = useState(defaultSteps);
  const steps = controlled ?? own;
  const commit = (next: PlanStep[]) => { if (!controlled) setOwn(next); onChange?.(next); };

  const draft = status === "draft";
  const runningIndex = steps.findIndex((s) => s.status === "running");
  const failedIndex = steps.findIndex((s) => s.status === "failed");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const stopped = status === "running" && runningIndex < 0 && failedIndex >= 0;
  const settled = status === "done" || stopped;
  const mode = draft ? "draft" : status === "done" ? "done" : stopped ? "stopped" : "running";

  // The run clock: starts when the plan leaves draft, stops when it settles, restarts on a rerun or retry.
  const [run, setRun] = useState<{ start: number; end: number | null } | null>(null);
  if (draft && run) setRun(null);
  if (!draft && !run) {
    // Mounted mid-run or finished: count back from the steps that already took time.
    const spent = steps.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    setRun({ start: startedAt ?? Date.now() - spent, end: settled ? Date.now() : null });
  }
  if (run && settled && run.end === null) setRun({ ...run, end: Date.now() });
  if (run && !draft && !settled && run.end !== null) setRun({ start: Date.now(), end: null });

  const [editing, setEditing] = useState<string | null>(null);
  const [said, announce] = useAnnouncer();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const addField = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number>(-1);
  const headingId = useId();
  const hintId = useId();
  const quote = (s: PlanStep) => `“${s.title}”`;

  // Read out how the run moves along: each step starting, finishing or failing.
  const seen = useRef(new Map<string, PlanStepStatus>());
  useEffect(() => {
    const before = seen.current;
    if (!draft) {
      for (const s of steps) {
        const was = before.get(s.id), now = s.status ?? "pending";
        if (was === undefined || was === now) continue;
        if (now === "running") announce(`Started ${quote(s)}`);
        if (now === "done") announce(`Finished ${quote(s)}`);
        if (now === "failed") announce(`${quote(s)} failed${s.error ? `: ${s.error}` : ""}`);
      }
    }
    seen.current = new Map(steps.map((s) => [s.id, s.status ?? "pending"]));
  });

  const focusRow = (id: string | undefined) => requestAnimationFrame(() => (id ? rows.current.get(id) : addField.current)?.focus());

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [step] = next.splice(index, 1);
    next.splice(to, 0, step!);
    commit(next);
    announce(`Moved ${quote(step!)} to position ${to + 1} of ${steps.length}`);
  };

  const remove = (index: number) => {
    const step = steps[index]!;
    const after = steps[index + 1] ?? steps[index - 1];
    commit(steps.filter((s) => s.id !== step.id));
    announce(`Removed ${quote(step)}`);
    focusRow(after?.id);
  };

  const rename = (id: string, text: string) => {
    setEditing(null);
    const step = steps.find((s) => s.id === id);
    const clean = text.trim();
    if (step && clean && clean !== step.title) {
      commit(steps.map((s) => (s.id === id ? { ...s, title: clean } : s)));
      announce(`Renamed to “${clean}”`);
    }
    focusRow(id);
  };

  const add = (text: string) => {
    const clean = text.trim();
    if (!clean) return false;
    commit([...steps, { id: `step-${Date.now().toString(36)}-${nextId++}`, title: clean }]);
    announce(`Added “${clean}” as step ${steps.length + 1}`);
    return true;
  };

  const position = runningIndex >= 0 ? runningIndex + 1 : Math.min(doneCount + 1, steps.length);
  const took = run ? (run.end ?? Date.now()) - run.start : 0;

  return (
    <MotionConfig reducedMotion="user">
    <Tray
      className={className}
      aria-labelledby={headingId}
      title={<><ListChecks /><span>Plan · <RollNumber value={steps.length} /> {steps.length === 1 ? "step" : "steps"}</span></>}
      meta={estimate ? <span><Swap id={draft ? "estimate" : "none"}>{draft ? <span className={styles.estimate}><span className="visually-hidden">About </span>{estimate}</span> : null}</Swap></span> : undefined}
      foot={
        <Swap id={mode} className={styles.foot}>
          {mode === "draft" && (
            <>
              <span className={styles.hint}>Drag to reorder</span>
              <TraySpacer />
              {onCancel && <Key size="sm" variant="tertiary" onClick={onCancel}>Cancel</Key>}
              <Key size="sm" variant="primary" disabled={!steps.length} onClick={() => onRun?.(steps)}>Run plan</Key>
            </>
          )}
          {mode === "running" && (
            <>
              <span className={styles.status}>Running · <RollNumber value={position} /> of {steps.length}</span>
              <TraySpacer />
              {run && <Duration since={run.start} running className={styles.clock} />}
            </>
          )}
          {mode === "stopped" && (
            <>
              <span className={styles.status}>Stopped at step {failedIndex + 1} of {steps.length}</span>
              <TraySpacer />
              <Duration ms={took} className={styles.clock} />
            </>
          )}
          {mode === "done" && (
            <>
              <span className={styles.status} data-done><DrawCheck size={13} />Done in {formatDuration(took)}</span>
              <TraySpacer />
              {onRun && <Key size="sm" variant="secondary" onClick={() => onRun(steps)}><RotateCcw />Run again</Key>}
            </>
          )}
        </Swap>
      }
    >
      <AutoHeight>
        <div className={styles.body}>
          <h3 id={headingId} className={styles.goal}>{title}</h3>
          <span id={hintId} className="visually-hidden">Enter renames, Alt with the arrow keys moves, Delete removes.</span>
          <Reorder.Group
            as="ol"
            axis="y"
            values={steps}
            onReorder={(next) => draft && commit(next)}
            className={styles.list}
            aria-labelledby={headingId}
            data-mode={mode}
          >
            <AnimatePresence initial={false}>
              {steps.map((step, i) => (
                <PlanRow
                  key={step.id}
                  ref={(el) => { if (el) rows.current.set(step.id, el); else rows.current.delete(step.id); }}
                  step={step}
                  index={i}
                  last={i === steps.length - 1}
                  draft={draft}
                  editing={editing === step.id}
                  hintId={hintId}
                  onEdit={() => setEditing(step.id)}
                  onRename={(text) => rename(step.id, text)}
                  onCancelEdit={() => { setEditing(null); focusRow(step.id); }}
                  onRemove={() => remove(i)}
                  onMove={(d) => move(i, d)}
                  onFocusSibling={(d) => focusRow(steps[i + d]?.id ?? step.id)}
                  onDragStart={() => { dragFrom.current = i; }}
                  onDragEnd={() => {
                    const to = steps.findIndex((s) => s.id === step.id);
                    if (to !== dragFrom.current) announce(`Moved ${quote(step)} to position ${to + 1} of ${steps.length}`);
                  }}
                  onRetry={onRetry && (() => onRetry(step.id))}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
          <Fold open={draft}>
            <label className={styles.add}>
              <Plus aria-hidden />
              <input
                ref={addField}
                className={styles.addInput}
                placeholder="Add step"
                aria-label="Add step"
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (add(e.currentTarget.value)) e.currentTarget.value = "";
                }}
              />
            </label>
          </Fold>
        </div>
      </AutoHeight>
      <span className="visually-hidden" role="status" aria-live="polite">{said.text}{said.n % 2 ? "\u00a0" : ""}</span>
    </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── One step ───────────────────────── */

interface PlanRowProps {
  ref?: Ref<HTMLLIElement>;
  step: PlanStep;
  index: number;
  last: boolean;
  draft: boolean;
  editing: boolean;
  hintId: string;
  onEdit: () => void;
  onRename: (text: string) => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onFocusSibling: (delta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRetry?: () => void;
}

const STATUS_WORDS: Record<PlanStepStatus, string> = { pending: "to do", running: "running", done: "done", failed: "failed" };

function PlanRow({ ref, step, index, last, draft, editing, hintId, onEdit, onRename, onCancelEdit, onRemove, onMove, onFocusSibling, onDragStart, onDragEnd, onRetry }: PlanRowProps) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const status = step.status ?? "pending";
  const failed = status === "failed";

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (!draft || e.target !== e.currentTarget) return;
    const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (delta && e.altKey) { e.preventDefault(); onMove(delta); }
    else if (delta) { e.preventDefault(); onFocusSibling(delta); }
    else if (e.key === "Enter") { e.preventDefault(); onEdit(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove(); }
  };

  return (
    <Reorder.Item
      ref={ref}
      as="li"
      value={step}
      dragListener={false}
      dragControls={controls}
      transition={{ layout: motionTokens.spring.travel }}
      onDragStart={() => { setDragging(true); onDragStart(); }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      className={styles.row}
      data-status={status}
      data-draft={draft || undefined}
      data-dragging={dragging || undefined}
      data-last={last || undefined}
      tabIndex={draft && !editing ? 0 : undefined}
      aria-describedby={draft ? hintId : undefined}
      aria-current={status === "running" ? "step" : undefined}
      onKeyDown={onKeyDown}
    >
      <motion.div
        className={styles.rowInner}
        initial={{ opacity: 0, y: 6, filter: `blur(${motionTokens.blur.subtle}px)` }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.98, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.standard } }}
        transition={{ duration: motionTokens.duration.considered, ease: motionTokens.ease.standard }}
      >
        <span className={styles.segment} aria-hidden><span className={styles.segmentFill} /></span>
        <StepMarker number={index + 1} status={status} />
        <div className={styles.text}>
          {editing ? (
            <RenameField title={step.title} onRename={onRename} onCancel={onCancelEdit} />
          ) : (
            <span className={styles.title} onClick={draft ? onEdit : undefined} data-editable={draft || undefined}>
              <Shimmer active={status === "running"}>{step.title}</Shimmer>
              {!draft && <span className="visually-hidden">, {STATUS_WORDS[status]}</span>}
            </span>
          )}
          {(step.tool || step.from !== undefined) && (
            <span className={styles.meta}>
              {step.tool && <Tag size="sm">{step.tool}</Tag>}
              {step.from !== undefined && (
                <span className={styles.range}>
                  <Timecode value={step.from} muted className={styles.time} />
                  {step.to !== undefined && <>–<Timecode value={step.to} muted className={styles.time} /></>}
                </span>
              )}
            </span>
          )}
          <Fold open={failed}>
            <div className={styles.failure}>
              {step.error && <p className={styles.error}>{step.error}</p>}
              {onRetry && <Key size="sm" variant="secondary" onClick={onRetry}><RotateCcw />Retry from here</Key>}
            </div>
          </Fold>
        </div>
        <span className={styles.side}>
          <Swap id={draft ? "edit" : status}>
            {draft ? (
              <>
                <IconKey size="sm" label={`Remove “${step.title}”`} tooltip="top" onClick={onRemove} className={styles.remove}><X /></IconKey>
                <span className={styles.grip} aria-hidden onPointerDown={(e: PointerEvent) => { e.preventDefault(); controls.start(e); }}><GripVertical /></span>
              </>
            ) : status === "running" && step.startedAt !== undefined ? (
              <Duration since={step.startedAt} running />
            ) : (status === "done" || failed) && step.duration !== undefined ? (
              <Duration ms={step.duration} muted />
            ) : null}
          </Swap>
        </span>
      </motion.div>
    </Reorder.Item>
  );
}

/**
 * The step's number in a hairline ring. Running, the number gives way to rays;
 * done, a light cell pops in under a check that draws itself; failed, a cross.
 * Every layer stays mounted so each hand-off crossfades.
 */
function StepMarker({ number, status }: { number: number; status: PlanStepStatus }) {
  return (
    <span className={styles.marker} data-status={status} aria-hidden>
      <span className={styles.markerFill} />
      <span className={styles.markerNumber}><RollNumber value={number} /></span>
      <RaySpinner size={14} className={styles.markerRays} />
      <svg className={styles.markerCheck} viewBox="0 0 16 16"><path d="M4.4 8.3 6.9 10.7 11.6 5.6" pathLength={1} /></svg>
      <svg className={styles.markerCross} viewBox="0 0 16 16"><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" pathLength={1} /></svg>
    </span>
  );
}

/** The title as a field. Enter saves, Esc puts the old title back, leaving the field saves. */
function RenameField({ title, onRename, onCancel }: { title: string; onRename: (text: string) => void; onCancel: () => void }) {
  const finished = useRef(false);
  const finish = (fn: () => void) => { if (finished.current) return; finished.current = true; fn(); };
  return (
    <input
      className={styles.rename}
      defaultValue={title}
      aria-label="Step name"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); const v = e.currentTarget.value; finish(() => onRename(v)); }
        if (e.key === "Escape") { e.preventDefault(); finish(onCancel); }
      }}
      onBlur={(e) => { const v = e.currentTarget.value; finish(() => onRename(v)); }}
    />
  );
}
