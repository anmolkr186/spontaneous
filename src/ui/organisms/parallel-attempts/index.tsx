/**
 * ParallelAttempts: best of N for an edit.
 *
 * The agent tries the same job several ways at once ("Pace the intro" as a
 * tight cut, a 2× speed ramp, a zoom with a callout) and the rows race. Each
 * row is one attempt: its approach and model, a line saying what it's doing,
 * and a bar in a well that grows as it works. Finishing turns that line into
 * the outcome in place ("Cuts 6.4s · keeps the click") and a score rolls in.
 * Once all of them are in, the best gets a Best tag and is picked; the pick is
 * a soft wash of light that glides to whichever row you choose with "Use this
 * one", and the rows you didn't pick step back. Rows never change height.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { MotionConfig, motion } from "motion/react";
import { Check, Split } from "lucide-react";
import { Duration, Key, RollNumber, RollText, Swap, Tag } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./parallel-attempts.module.css";

export type AttemptStatus = "queued" | "running" | "done" | "failed";

export interface Attempt {
  id: string;
  /** The approach, in a few words: "Tight cut". */
  name: string;
  /** The model trying it: "Claude Sonnet". */
  model?: string;
  status: AttemptStatus;
  /** 0 to 1: how far along the bar is while it runs, and where a failed one stopped. */
  progress?: number;
  /** While running: what it's doing right now. */
  step?: string;
  /** 0–100 once done. The highest is marked Best and picked unless someone picks another. */
  score?: number;
  /** Once done, the outcome in one line; once failed, the error. */
  note?: string;
  /** How long it took, in ms. */
  took?: number;
  /** When it started (ms since epoch), so its clock ticks while it runs. */
  startedAt?: number;
}

export interface ParallelAttemptsProps {
  /** One per attempt, in the order the rows show. */
  attempts: Attempt[];
  /** What all of them are trying to do, next to the title: "Pace the intro". */
  task?: string;
  /** Heading of the tray. Default "Best of 3" (the number of attempts). */
  title?: string;
  /** Controlled pick. Leave it out and the best finished attempt is picked once all are in. */
  picked?: string | null;
  /** Another attempt was chosen with "Use this one". */
  onPick?: (attempt: Attempt) => void;
  className?: string;
}

/** Remembers the last thing to read out, keyed so the same words can be said twice. */
function useAnnouncer() {
  const [said, setSaid] = useState({ n: 0, text: "" });
  return [said, (text: string) => setSaid((s) => ({ n: s.n + 1, text }))] as const;
}

export function ParallelAttempts({ attempts, task, title, picked: controlled, onPick, className }: ParallelAttemptsProps) {
  const heading = title ?? `Best of ${attempts.length}`;
  const settled = attempts.length > 0 && attempts.every((a) => a.status === "done" || a.status === "failed");
  const scored = attempts.filter((a) => a.status === "done" && a.score !== undefined);
  const best = settled && scored.length ? scored.reduce((b, a) => (a.score! > b.score! ? a : b)) : undefined;

  const [chosen, setChosen] = useState<string | null>(null);
  const picked = controlled !== undefined ? controlled : chosen ?? best?.id ?? null;
  const pickedAttempt = attempts.find((a) => a.id === picked);
  const doneCount = attempts.filter((a) => a.status === "done" || a.status === "failed").length;

  const [said, announce] = useAnnouncer();
  const washId = useId();
  const groupId = useId();

  const pick = (a: Attempt) => {
    if (a.id === picked || a.status !== "done") return;
    if (controlled === undefined) setChosen(a.id);
    onPick?.(a);
    announce(`Using ${a.name}`);
  };

  // Read out each attempt as it finishes, and the best once they're all in.
  const seen = useRef(new Map(attempts.map((a) => [a.id, a.status])));
  useEffect(() => {
    for (const a of attempts) {
      const was = seen.current.get(a.id);
      if (was === a.status) continue;
      if (a.status === "done") announce(`${a.name} finished${a.score !== undefined ? `, score ${a.score}` : ""}`);
      if (a.status === "failed") announce(`${a.name} failed${a.note ? `: ${a.note}` : ""}`);
    }
    seen.current = new Map(attempts.map((a) => [a.id, a.status]));
  });
  const announcedBest = useRef<string | null>(null);
  useEffect(() => {
    if (!best || announcedBest.current === best.id) return;
    announcedBest.current = best.id;
    announce(`${best.name} is best with ${best.score}. Using it.`);
  }, [best?.id]);

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        className={className}
        title={<><Split /><span id={groupId} className={styles.heading}>{heading}</span>{task && <span className={styles.task}>{task}</span>}</>}
        meta={<span><RollNumber value={doneCount} /> of {attempts.length}</span>}
        foot={
          <span className={styles.foot}>
            <RollText text={!settled ? `Trying ${attempts.length} ways at once` : pickedAttempt ? `Using ${pickedAttempt.name}` : "None of them worked"} />
          </span>
        }
      >
        <div className={styles.list} role="radiogroup" aria-labelledby={groupId} data-picked={picked ? "" : undefined}>
          {attempts.map((a, i) => (
            <AttemptRow key={a.id} attempt={a} index={i} best={best?.id === a.id} picked={picked === a.id} washId={washId} onPick={() => pick(a)} />
          ))}
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{said.text}{said.n % 2 ? " " : ""}</span>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── One attempt ───────────────────────── */

function AttemptRow({ attempt: a, index, best, picked, washId, onPick }: { attempt: Attempt; index: number; best: boolean; picked: boolean; washId: string; onPick: () => void }) {
  const finished = a.status === "done";
  const line = a.status === "running" ? a.step ?? "Working"
    : a.status === "queued" ? "Waiting to start"
    : a.note ?? (finished ? "Finished" : "Failed");
  const progress = a.status === "done" ? 1 : Math.min(Math.max(a.progress ?? 0, 0), 1);

  return (
    <div
      className={styles.row}
      data-status={a.status}
      data-picked={picked || undefined}
      style={{ "--i": index, "--p": progress } as CSSProperties}
      onClick={finished ? onPick : undefined}
    >
      {picked && <motion.span layoutId={washId} className={styles.wash} transition={motionTokens.spring.morph} aria-hidden />}
      <span className={styles.name}>
        {a.name}
        {a.model && <span className={styles.model}>{a.model}</span>}
      </span>
      <span className={styles.score}>
        <Swap id={best ? "best" : "plain"}>{best ? <Tag size="sm">Best</Tag> : null}</Swap>
        {a.score !== undefined && finished && <Score value={a.score} />}
      </span>
      <span className={styles.line} data-failed={a.status === "failed" || undefined}>
        <RollText text={line} shimmer={a.status === "running"} glide={false} />
      </span>
      <span className={styles.slot}>
        <span className={styles.took}>
          {a.status === "running" && a.startedAt !== undefined ? <Duration since={a.startedAt} running /> : a.took !== undefined ? <Duration ms={a.took} muted /> : null}
        </span>
        {finished && (
          <Key
            size="sm"
            variant="tertiary"
            role="radio"
            aria-checked={picked}
            aria-label={`${picked ? "In use" : "Use this one"}: ${a.name}${a.score !== undefined ? `, score ${a.score}` : ""}`}
            className={styles.use}
            onClick={(e) => { e.stopPropagation(); onPick(); }}
          >
            <Swap id={picked ? "in-use" : "use"}>{picked ? <><Check />In use</> : "Use this one"}</Swap>
          </Key>
        )}
      </span>
      <span className={styles.track} aria-hidden>
        <span className={styles.fill} />
      </span>
    </div>
  );
}

/** A score that rolls up from zero the moment it appears. */
function Score({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <span className={styles.scoreValue}><span className="visually-hidden">Score </span><RollNumber value={shown} /></span>;
}
