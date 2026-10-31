import { useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { Cell, Mark } from "@/ui/atoms";
import { formatTime } from "@/editor/model";
import type { Author } from "@/editor/model";
import styles from "./timeline.module.css";

const LABEL_WIDTH = 108;
/** Space the timeline keeps around the tracks: the label column and a little room after the end. */
const GUTTER = LABEL_WIDTH + 24;

/** Pixels per second that fit the whole duration into a timeline this wide. */
export function fitPps(width: number, duration: number) {
  return Math.max(1, (width - GUTTER - 2) / Math.max(1, duration));
}

export interface TimelineProps {
  duration: number;
  /** Pixels per second. */
  pps: number;
  time: number;
  onSeek: (t: number) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Scrollable multi-track timeline. Tracks are children; the ruler and playhead
 * are shared. Clicking or dragging on the ruler scrubs.
 */
export function Timeline({ duration, pps, time, onSeek, children, className }: TimelineProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const width = duration * pps;

  const timeAt = (clientX: number) => {
    const r = contentRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, (clientX - r.left - LABEL_WIDTH) / pps));
  };
  const scrub = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(timeAt(e.clientX));
  };
  const drag = (e: ReactPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(timeAt(e.clientX));
  };

  return (
    <div className={[styles.timeline, className].filter(Boolean).join(" ")}>
      <div className={styles.scroller}>
        <div ref={contentRef} className={styles.content} style={{ width: width + GUTTER }}>
          <Ruler duration={duration} pps={pps} onPointerDown={scrub} onPointerMove={drag} />
          {children}
          <div className={styles.playhead} style={{ left: LABEL_WIDTH + time * pps }}>
            <div className={styles.playheadKnob} onPointerDown={scrub} onPointerMove={drag} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(time)} aria-valuetext={formatTime(time)} tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") onSeek(time - (e.shiftKey ? 1 : 1 / 60));
                if (e.key === "ArrowRight") onSeek(time + (e.shiftKey ? 1 : 1 / 60));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Ruler({ duration, pps, ...handlers }: { duration: number; pps: number; onPointerDown: (e: ReactPointerEvent) => void; onPointerMove: (e: ReactPointerEvent) => void }) {
  // Pick a label step that keeps labels at least ~64px apart.
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 64) ?? 60;
  const minor = step >= 10 ? step / 5 : step / 2;
  const ticks = useMemo(() => {
    const out: { t: number; major: boolean }[] = [];
    for (let t = 0; t <= duration + 1e-6; t += minor) out.push({ t, major: Math.abs(t / step - Math.round(t / step)) < 1e-6 });
    return out;
  }, [duration, step, minor]);
  return (
    <div className={styles.ruler} {...handlers}>
      {ticks.map(({ t, major }) => (
        <span key={t}>
          <i className={styles.tick} data-major={major || undefined} style={{ left: t * pps }} />
          {major && <span className={styles.tickLabel} style={{ left: t * pps }}>{formatTime(t)}</span>}
        </span>
      ))}
    </div>
  );
}

export interface TrackProps {
  label: string;
  children?: ReactNode;
  height?: number;
}

/** One labelled lane. Items inside position themselves in seconds via `TrackItem`. */
export function Track({ label, children, height }: TrackProps) {
  return (
    <div className={styles.track} style={height ? { height } : undefined}>
      <div className={styles.trackLabel}>{label}</div>
      <div className={styles.lane}>{children}</div>
    </div>
  );
}

export type TrackItemKind = "zoom" | "overlay";

export interface TrackItemProps {
  start: number;
  end: number;
  pps: number;
  kind: TrackItemKind;
  label: ReactNode;
  meta?: ReactNode;
  author?: Author;
  selected?: boolean;
  onSelect?: () => void;
}

/** A block on a track spanning [start, end] seconds. The marker shows who made it: a solid cell for you, a hollow cell for auto, the mark for the agent. */
export function TrackItem({ start, end, pps, kind, label, meta, author, selected, onSelect }: TrackItemProps) {
  const style: CSSProperties = { left: start * pps, width: Math.max(6, (end - start) * pps) };
  const by = author === "agent" ? "Added by agent" : author === "auto" ? "Auto" : "Added by you";
  return (
    <button type="button" className={styles.item} data-kind={kind} aria-pressed={selected} style={style} onClick={onSelect} title={author ? by : undefined}>
      {author === "agent" ? <Mark size={12} title="" /> : author ? <Cell variant={author === "auto" ? "hollow" : "solid"} size={6} /> : null}
      <span>{label}</span>
      {meta && <span className={styles.meta}>{meta}</span>}
    </button>
  );
}

/** A screen clip with a filmstrip backdrop. */
export function ClipItem({ start, end, pps, label, selected, onSelect }: Omit<TrackItemProps, "kind" | "meta" | "author">) {
  return (
    <button type="button" className={`${styles.item} ${styles.clip}`} aria-pressed={selected} onClick={onSelect}
      style={{ left: start * pps, width: (end - start) * pps - 2 }}>
      <span className={styles.film} />
      <span className={styles.clipLabel}>{label}</span>
    </button>
  );
}

/** A note pinned to a time. */
export function NoteMarker({ at, pps, index, status, selected, onSelect, label }: { at: number; pps: number; index: number; status: string; selected?: boolean; onSelect?: () => void; label: string }) {
  return (
    <button type="button" className={styles.noteMarker} data-status={status} aria-pressed={selected} aria-label={label} onClick={onSelect} style={{ left: at * pps }}>
      {index}
    </button>
  );
}

/** A deterministic placeholder waveform (real peaks come from Rust over the spontaneous:// protocol). */
export function Waveform({ duration, pps, seed = 7 }: { duration: number; pps: number; seed?: number }) {
  const bars = useMemo(() => {
    const n = Math.floor((duration * pps) / 3);
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: n }, (_, i) => {
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 23)) * (0.6 + 0.4 * Math.sin(i / 7));
      return Math.max(0.08, env * (0.55 + rand() * 0.45));
    });
  }, [duration, pps, seed]);
  return (
    <svg className={styles.wave} viewBox={`0 0 ${bars.length * 3} 100`} preserveAspectRatio="none" aria-hidden>
      {bars.map((h, i) => <rect key={i} x={i * 3} y={50 - h * 50} width={1.6} height={h * 100} rx={0.8} />)}
    </svg>
  );
}

export interface TransportProps {
  time: number;
  duration: number;
  playing: boolean;
  fps?: number;
  onPlayPause: () => void;
  start?: ReactNode;
  end?: ReactNode;
}

/** Play/pause and timecode, with slots for tools on either side. */
export function Transport({ time, duration, playing, fps = 60, onPlayPause, start, end }: TransportProps) {
  return (
    <div className={styles.transport}>
      <button type="button" className={styles.play} onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={14} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
      </button>
      <div className={styles.transportTime}>
        <span className="sp-mono" style={{ fontSize: "var(--text-base)" }}>{formatTime(time, true, fps)}</span>
        <span className="sp-mono" style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>/ {formatTime(duration)}</span>
      </div>
      {start}
      <span className={styles.spacer} />
      {end}
    </div>
  );
}

export { styles as timelineStyles };
