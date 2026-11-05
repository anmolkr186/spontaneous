/**
 * CitedAnswer: an agent answer wired to the moments in the recording it rests on.
 *
 * Each claim ends in a small marker: the moment's time in a chip, or the ink
 * pin when the moment is one of your notes. Pointing at a marker tints its
 * sentence and lights its chip in the tray; pointing at a chip tints every
 * sentence that cites it and steps the rest back. Clicking either unfolds a
 * preview under the answer: frames from that moment, the narration with the
 * matching words marked, and a key that jumps the playhead there. Switching to
 * another moment crossfades the preview in place.
 *
 * While `streaming`, words rise out of a small blur a few at a time, markers
 * pop in after their sentence, and a pulsing cell marks where the text grows.
 */
import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { AudioLines, Image, MousePointerClick } from "lucide-react";
import { Cell, Fold, Key, Shimmer, Swap, Timecode } from "@/ui/atoms";
import { AutoHeight } from "@/ui/atoms";
import { Tray, TrayCard, TrayRow } from "@/ui/molecules/tray";
import { NotePin } from "@/ui/organisms/agent";
import { formatTime } from "@/editor/model";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import { CtaKey, answerLabel, proposedPrimary } from "@/ui/cta";
import type { CtaProposal } from "@/ui/cta";
import styles from "./cited-answer.module.css";

export type MomentKind = "frame" | "transcript" | "note" | "click";

export interface Moment {
  id: string;
  /** Where it starts, in seconds. */
  at: number;
  /** Where it ends, for moments that span time. */
  end?: number;
  /** What happens there, in a few words: "Create button click". */
  title: string;
  /** What the agent read: a frame, the narration, one of your notes, or a click. */
  kind: MomentKind;
  /** The narration (or the note's words) at that moment. */
  quote?: string;
  /** Words in the quote to mark as the ones the answer rests on. */
  highlight?: string | string[];
  /** One frame, or an array of frames across the moment for a strip. A string is an image URL. */
  thumb?: ReactNode;
  /** For notes: the pin number on the frame. */
  pin?: number;
}

export interface CitedSegment {
  /** A sentence or part of one. Spaces at its edges stay outside the tint. */
  text: string;
  /** Ids of the moments it rests on; one marker each, after the text. */
  cite?: string[];
  /** Starts a new paragraph. */
  paragraph?: boolean;
}

export interface CitedAnswerProps {
  /** The answer in order. While streaming, only append: grow the last segment or add new ones. */
  segments: CitedSegment[];
  /** The moments the answer cites, in the order their chips show. */
  moments: Moment[];
  /** More text is still coming: words rise in, markers pop, a cell pulses at the end. */
  streaming?: boolean;
  /** Tray title. */
  title?: ReactNode;
  /** Right of the tray title. */
  meta?: ReactNode;
  /** Id of the moment whose preview is open at first. */
  defaultOpen?: string;
  /** A preview opened, switched or closed. */
  onPreviewChange?: (id: string | null) => void;
  /** "Go to 0:12" in the preview. */
  onSeek?: (t: number, moment: Moment) => void;
  /** One action on the tray, e.g. Apply as edits. Disabled while streaming. */
  action?: { label?: string; onClick: () => void };
  /** How many edits the action would make; words it "Apply as 3 edits". */
  edits?: number;
  /** Labels the agent proposed for the main key. Shown when they pass the checks; otherwise the derived label. */
  cta?: CtaProposal;
  className?: string;
}

type Lit = { from: "marker"; seg: number; id: string } | { from: "chip"; id: string } | null;

const KIND_ICON: Record<Exclude<MomentKind, "note">, ReactNode> = {
  frame: <Image />,
  transcript: <AudioLines />,
  click: <MousePointerClick />,
};
const WORD_STAGGER = motionTokens.stagger.word * 1000;
const MAX_STAGGER = 8;

const span = (m: Moment) => (m.end !== undefined ? `${formatTime(m.at)}–${formatTime(m.end)}` : formatTime(m.at));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Note 2: zoom here · 0:12" or "Moment 3: Create button click · 0:12". */
function nameOf(m: Moment, n: number) {
  return `${m.kind === "note" ? `Note ${m.pin ?? n}` : `Moment ${n}`}: ${m.title}, ${span(m)}`;
}

export function CitedAnswer({
  segments,
  moments,
  streaming = false,
  title = "From your recording",
  meta,
  defaultOpen,
  onPreviewChange,
  onSeek,
  action,
  edits,
  cta,
  className,
}: CitedAnswerProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const previewId = `${uid}-preview`;
  const byId = new Map(moments.map((m, i) => [m.id, { m, n: i + 1 }]));

  const [open, setOpen] = useState<string | null>(defaultOpen && byId.has(defaultOpen) ? defaultOpen : null);
  const [shown, setShown] = useState(open);
  if (open && open !== shown) setShown(open);
  const [lit, setLit] = useState<Lit>(null);
  const [rove, setRove] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (id: string, from: HTMLElement) => {
    const next = open === id ? null : id;
    opener.current = next ? from : null;
    setOpen(next);
    onPreviewChange?.(next);
  };

  const close = () => {
    if (!open) return;
    const back = opener.current?.isConnected ? opener.current : chips.current[moments.findIndex((m) => m.id === open)];
    setOpen(null);
    onPreviewChange?.(null);
    back?.focus();
  };

  /* ── Streaming: which words and markers arrive now, and a beat apart ── */
  // A finished answer just shows. An answer that mounts streaming, and anything
  // added after the first render, arrives: words a beat apart (capped), markers
  // a moment after their sentence. A delay, once given, is kept, so re-renders
  // (hovers, opens) never restart or cut an arrival short.
  const [animateAll] = useState(streaming);
  const mounted = useRef(false);
  const seenWords = useRef(0);
  const seenMarkers = useRef(new Set<string>());
  const delays = useRef(new Map<string, number>());
  let wordIndex = 0;
  let batch = 0;
  let newest = 0;
  const markerKeys: string[] = [];
  const wordDelay = (g: number) => {
    const key = `w${g}`;
    const known = delays.current.get(key);
    if (known !== undefined) return known;
    if (!animateAll && !(mounted.current && g >= seenWords.current)) return undefined;
    const d = Math.min(batch++, MAX_STAGGER) * WORD_STAGGER;
    delays.current.set(key, d);
    newest = d;
    return d;
  };
  const markerDelay = (key: string, after: number) => {
    markerKeys.push(key);
    const known = delays.current.get(key);
    if (known !== undefined) return known;
    if (!animateAll && !(mounted.current && !seenMarkers.current.has(key))) return undefined;
    const d = after + 120;
    delays.current.set(key, d);
    return d;
  };

  const paragraphs: { seg: CitedSegment; si: number }[][] = [];
  segments.forEach((seg, si) => {
    if (!paragraphs.length || (seg.paragraph && paragraphs[paragraphs.length - 1]!.length)) paragraphs.push([]);
    paragraphs[paragraphs.length - 1]!.push({ seg, si });
  });

  const litId = lit?.id ?? null;
  const tinted = (seg: CitedSegment, si: number) =>
    lit ? (lit.from === "marker" ? lit.seg === si : !!seg.cite?.includes(lit.id)) : !!open && !!seg.cite?.includes(open);

  const answer = paragraphs.map((para, pi) => (
    <p key={pi} className={styles.paragraph}>
      {para.map(({ seg, si }) => {
        const lead = seg.text.match(/^\s*/)![0];
        const core = seg.text.slice(lead.length).trimEnd();
        const trail = seg.text.slice(lead.length + core.length);
        const words = core.match(/\S+\s*/g) ?? [];
        newest = 0;
        const body = words.map((w, wi) => {
          const g = wordIndex++;
          const d = wordDelay(g);
          return <span key={wi} className={d !== undefined ? styles.wordIn : undefined} style={d !== undefined ? ({ "--d": `${d}ms` } as CSSProperties) : undefined}>{w}</span>;
        });
        const isLast = si === segments.length - 1;
        return (
          <span key={si} className={styles.seg} data-lit={tinted(seg, si) || undefined} data-faded={(lit?.from === "chip" && !seg.cite?.includes(lit.id)) || undefined}>
            {lead}
            <span className={styles.core}>{body}</span>
            {seg.cite?.map((id) => {
              const hit = byId.get(id);
              if (!hit) return null;
              const d = markerDelay(`m${si}:${id}`, newest);
              return (
                <Marker key={id} moment={hit.m} n={hit.n} open={open === id} lit={litId === id} delay={d} controls={previewId}
                  onToggle={(el) => toggle(id, el)}
                  onLight={(on) => setLit(on ? { from: "marker", seg: si, id } : null)} />
              );
            })}
            {trail}
            {streaming && isLast && <Cell size={6} className={styles.caret} />}
          </span>
        );
      })}
    </p>
  ));
  const totalWords = wordIndex;
  useEffect(() => {
    mounted.current = true;
    seenWords.current = totalWords;
    markerKeys.forEach((k) => seenMarkers.current.add(k));
  });

  /* ── Chips: one per moment, ←/→ between them ── */
  const onChipKey = (i: number) => (e: KeyboardEvent) => {
    const n = moments.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setRove(to);
    chips.current[to]?.focus();
  };

  const notes = moments.filter((m) => m.kind === "note").length;
  const others = moments.length - notes;
  const summary = [others && plural(others, "moment", "moments"), notes && plural(notes, "note", "notes")].filter(Boolean).join(" · ");
  const openMoment = open ? byId.get(open)?.m : undefined;
  const line = streaming ? `Answering from ${plural(moments.length, "moment", "moments")}` : openMoment ? `${openMoment.title} · ${span(openMoment)}` : summary;
  const shownMoment = shown ? byId.get(shown)?.m : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        bare
        className={[styles.root, className].filter(Boolean).join(" ")}
        aria-label={typeof title === "string" ? title : "Answer"}
        title={title}
        meta={meta}
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); close(); } }}
        foot={
          <>
            <span className={styles.line} aria-live="polite">
              <Swap id={line}>{streaming ? <Shimmer>{line}</Shimmer> : line}</Swap>
            </span>
            {action && <CtaKey size="sm" intent="apply" count={edits} label={action.label ?? answerLabel(edits ?? 1)} proposal={proposedPrimary(cta, "apply")}
              disabled={streaming} reason="Still answering" onClick={action.onClick} />}
          </>
        }
      >
        <TrayCard>
          <div className={styles.answer} aria-busy={streaming || undefined}>{answer}</div>
          <Fold open={!!open} className={styles.fold}>
            <section id={previewId} aria-label={shownMoment ? nameOf(shownMoment, byId.get(shownMoment.id)!.n) : undefined}>
              <AutoHeight>
                <AnimatePresence mode="popLayout" initial={false}>
                  {shownMoment && (
                    <motion.div key={shownMoment.id} {...blurIn} transition={reduce ? { duration: 0 } : blurIn.transition}>
                      <Preview moment={shownMoment} onSeek={onSeek} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </AutoHeight>
            </section>
          </Fold>
        </TrayCard>
        <TrayRow className={styles.chips} role="toolbar" aria-label="Moments">
          {moments.map((m, i) => (
            <button
              key={m.id}
              ref={(el) => { chips.current[i] = el; }}
              type="button"
              className={styles.chip}
              data-lit={litId === m.id || undefined}
              data-fresh={animateAll || undefined}
              style={{ "--i": i } as CSSProperties}
              tabIndex={i === rove ? 0 : -1}
              aria-label={nameOf(m, i + 1)}
              aria-expanded={open === m.id}
              aria-controls={previewId}
              onClick={(e) => { setRove(i); toggle(m.id, e.currentTarget); }}
              onKeyDown={onChipKey(i)}
              onFocus={() => { setRove(i); setLit({ from: "chip", id: m.id }); }}
              onBlur={() => setLit(null)}
              onPointerEnter={() => setLit({ from: "chip", id: m.id })}
              onPointerLeave={() => setLit(null)}
            >
              {m.kind === "note" ? <NotePin index={m.pin ?? i + 1} /> : <span className={styles.chipIcon} aria-hidden>{KIND_ICON[m.kind]}</span>}
              <span className={styles.chipTime}>{formatTime(m.at)}</span>
            </button>
          ))}
        </TrayRow>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── Marker ───────────────────────── */

/** The citation after a sentence: the moment's time in a small chip, or your note's ink pin. */
function Marker({ moment, n, open, lit, delay, controls, onToggle, onLight }: {
  moment: Moment; n: number; open: boolean; lit: boolean; delay?: number; controls: string;
  onToggle: (el: HTMLElement) => void; onLight: (on: boolean) => void;
}) {
  const note = moment.kind === "note";
  return (
    <button
      type="button"
      className={styles.marker}
      data-note={note || undefined}
      data-lit={lit || undefined}
      data-open={open || undefined}
      data-fresh={delay !== undefined || undefined}
      style={delay !== undefined ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}
      aria-label={nameOf(moment, n)}
      aria-expanded={open}
      aria-controls={controls}
      onClick={(e) => onToggle(e.currentTarget)}
      onPointerEnter={() => onLight(true)}
      onPointerLeave={() => onLight(false)}
      onFocus={() => onLight(true)}
      onBlur={() => onLight(false)}
    >
      {note ? <NotePin index={moment.pin ?? n} /> : formatTime(moment.at)}
    </button>
  );
}

/* ───────────────────────── Preview ───────────────────────── */

/** The moment behind a citation: its frames, the narration with the matching words marked, and a way there. */
function Preview({ moment, onSeek }: { moment: Moment; onSeek?: (t: number, m: Moment) => void }) {
  const frames = moment.thumb === undefined || moment.thumb === null ? [] : Array.isArray(moment.thumb) ? moment.thumb : [moment.thumb];
  const marks = (Array.isArray(moment.highlight) ? moment.highlight : moment.highlight ? [moment.highlight] : []).filter((h) => h.trim());
  const parts = moment.quote && marks.length ? moment.quote.split(new RegExp(`(?<![\\w])(${marks.map(escape).join("|")})(?![\\w])`, "gi")) : moment.quote ? [moment.quote] : [];
  const isMark = (p: string) => marks.some((h) => h.toLowerCase() === p.toLowerCase());
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        {moment.kind === "note" ? <NotePin index={moment.pin ?? 1} /> : <span className={styles.chipIcon} aria-hidden>{KIND_ICON[moment.kind]}</span>}
        <span className={styles.previewTitle}>{moment.title}</span>
        <span className={styles.previewTime}>{span(moment)}</span>
      </div>
      {frames.length > 0 && (
        <div className={styles.strip} data-count={Math.min(frames.length, 4)}>
          {frames.slice(0, 4).map((f, i) => (
            <span key={i} className={styles.frame}>{typeof f === "string" ? <img src={f} alt="" /> : f}</span>
          ))}
        </div>
      )}
      {parts.length > 0 && (
        <blockquote className={styles.quote}>
          {parts.map((p, i) => (isMark(p) ? <mark key={i} className={styles.mark}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
        </blockquote>
      )}
      {onSeek && (
        <div className={styles.previewFoot}>
          <Key size="sm" variant="secondary" onClick={() => onSeek(moment.at, moment)}>Go to <Timecode value={moment.at} className={styles.keyTime} /></Key>
        </div>
      )}
    </div>
  );
}
