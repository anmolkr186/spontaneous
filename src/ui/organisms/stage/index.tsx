import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { call } from "@/platform/tauri";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import type { Note } from "@/editor/model";
import styles from "./stage.module.css";

/* ───────────────────────── Canvas viewport ───────────────────────── */

const ASPECTS: Record<string, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 };

export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export interface CanvasViewportProps {
  aspect: string;
  /** Space kept clear around the canvas for floating chrome: [top, right, bottom, left]. */
  inset?: [number, number, number, number];
  background?: string;
  children?: ReactNode;
  overlay?: ReactNode;
  className?: string;
}

/**
 * The "canvas hole". Fits a frame of the given aspect into the stage and reports
 * its rect to Rust, which will size the native wgpu layer to match (phase 3).
 * Children render inside the frame; `overlay` renders above it for stage chrome.
 */
export function CanvasViewport({ aspect, inset = [52, 24, 92, 24], background, children, overlay, className }: CanvasViewportProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  const ratio = ASPECTS[aspect] ?? 16 / 9;
  const availW = Math.max(0, stage.width - inset[1] - inset[3]);
  const availH = Math.max(0, stage.height - inset[0] - inset[2]);
  const width = Math.min(availW, availH * ratio);
  const height = width / ratio;
  const top = inset[0] + (availH - height) / 2;

  useEffect(() => {
    const node = canvasRef.current;
    if (!node || !width) return;
    const r = node.getBoundingClientRect();
    void call("set_viewport_rect", { rect: { x: r.x, y: r.y, width: r.width, height: r.height, scale: window.devicePixelRatio } });
  }, [width, height, top]);

  return (
    <div ref={stageRef} className={[styles.stage, className].filter(Boolean).join(" ")}>
      <div
        ref={canvasRef}
        className={styles.canvas}
        data-canvas-hole=""
        style={{ position: "absolute", top, left: inset[3] + (availW - width) / 2, width, height, background }}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}

/* ───────────────────────── Camera ───────────────────────── */

export interface CameraProps {
  scale: number;
  target: { x: number; y: number };
  children: ReactNode;
}

/**
 * Spring camera for the phase 1 preview. Mirrors the motion crate's model:
 * scale and center are separate spring channels, and the pan is clamped so the
 * frame edges never show.
 */
export function Camera({ scale, target, children }: CameraProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(frameRef);
  const reduced = useReducedMotion();
  const config = reduced ? { duration: 0 } : { stiffness: 200, damping: 40, mass: 2.25 };
  const s = useSpring(1, config);
  const x = useSpring(0, config);
  const y = useSpring(0, config);
  useEffect(() => {
    const maxX = ((scale - 1) * width) / 2;
    const maxY = ((scale - 1) * height) / 2;
    s.set(scale);
    x.set(Math.max(-maxX, Math.min(maxX, (0.5 - target.x) * width * scale)));
    y.set(Math.max(-maxY, Math.min(maxY, (0.5 - target.y) * height * scale)));
  }, [scale, target.x, target.y, width, height, s, x, y]);
  return (
    <div ref={frameRef} style={{ position: "absolute", inset: 0 }}>
      <motion.div className={styles.camera} style={{ scale: s, x, y }}>{children}</motion.div>
    </div>
  );
}

/* ───────────────────────── Device frames ───────────────────────── */

export type DeviceKind = "browser" | "browser-minimal" | "window" | "iphone";

export interface DeviceFrameProps {
  kind: DeviceKind;
  url?: string;
  radius?: number;
  shadow?: number;
  /** Padding around the device as a percentage of the canvas. */
  padding?: number;
  /** Width / height of the screen content. When set, the frame keeps that shape instead of filling the canvas. */
  contentAspect?: number;
  children: ReactNode;
}

/** Wraps a screen in a device or browser chrome. Templates choose the kind. */
export function DeviceFrame({ kind, url = "", radius = 12, shadow = 60, padding = 8, contentAspect, children }: DeviceFrameProps) {
  const vars = { "--frame-radius": `${radius}px`, "--frame-shadow": shadow } as CSSProperties;
  if (kind === "iphone") {
    return (
      <div className={styles.phone} style={vars}>
        <div className={styles.island} />
        <div className={styles.phoneScreen}>{children}</div>
      </div>
    );
  }
  const fill = 100 - padding * 2;
  // Container units (the camera is a size container) fit the frame to the content's aspect.
  const box: CSSProperties = contentAspect
    ? { width: `min(${fill}cqw, ${fill * contentAspect}cqh)`, aspectRatio: String(contentAspect) }
    : { width: `${fill}%`, height: `${fill}%` };
  return (
    <div style={{ ...box, ...vars }}>
      <div className={styles.browser}>
        {kind !== "window" && (
          <div className={styles.browserBar} data-minimal={kind === "browser-minimal" || undefined}>
            <span className={styles.lights}><i /><i /><i /></span>
            {kind === "browser" && <span className={styles.address}>{url}</span>}
          </div>
        )}
        <div className={styles.browserBody}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Phase 2 preview of a real recording: the source video kept in sync with the
 * editor clock. The native renderer replaces this in phase 3.
 */
export function VideoScreen({ src, time, playing }: { src: string; time: number; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, [playing]);
  useEffect(() => {
    const video = ref.current;
    if (!video || !Number.isFinite(video.duration)) return;
    if (!playing || Math.abs(video.currentTime - time) > 0.25) video.currentTime = Math.min(time, video.duration);
  }, [time, playing]);
  return <video ref={ref} className={styles.video} src={src} muted={false} playsInline preload="auto" />;
}

/** The re-rendered cursor (the recording itself never contains it). */
export function Cursor({ x, y, size = 1, clicking }: { x: number; y: number; size?: number; clicking?: boolean }) {
  return (
    <>
      {clicking && (
        <motion.span
          className={styles.ripple}
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <svg className={styles.cursor} viewBox="0 0 24 24" style={{ left: `${x * 100}%`, top: `${y * 100}%`, scale: size }}>
        <path d="M5 3 L19 12.5 L12.2 13.6 L9 20 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
}

/* ───────────────────────── Annotations ───────────────────────── */

type Draft = Pick<Note, "ink" | "region" | "screen">;

export interface AnnotationLayerProps {
  notes: Note[];
  tool: "pointer" | "pen" | "region";
  draft?: Draft | null;
  onDraft?: (draft: Draft) => void;
  onPinClick?: (id: string) => void;
  /** Pin numbers by note id; defaults to the order of `notes`. */
  numbers?: Record<string, number>;
  /** Where a region drawn on this layer lands on the recording, stored with the draft as `screen`. */
  locate?: (region: NonNullable<Note["region"]>, layer: HTMLElement) => Note["screen"];
}

/**
 * Ink, regions and pins drawn in normalized coordinates of the box the layer
 * fills, so they stay attached to it at any size. On the stage that box is the
 * whole canvas, backdrop included. With the pen or region tool active, pointer
 * input draws a draft that the dock turns into a note.
 */
export function AnnotationLayer({ notes, tool, draft = null, onDraft, onPinClick, numbers, locate }: AnnotationLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const points = useRef<[number, number][]>([]);
  const [live, setLive] = useState<string | null>(null);
  const [liveRegion, setLiveRegion] = useState<Note["region"] | null>(null);

  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const toLocal = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [clamp(((e.clientX - r.left) / r.width) * 100), clamp(((e.clientY - r.top) / r.height) * 100)] as [number, number];
  };
  const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const regionOf = (a: [number, number], b: [number, number]) => ({
    x: Math.min(a[0], b[0]) / 100, y: Math.min(a[1], b[1]) / 100,
    w: Math.abs(a[0] - b[0]) / 100, h: Math.abs(a[1] - b[1]) / 100,
  });
  const commit = (d: Draft) => onDraft?.(d.region && locate ? { ...d, screen: locate(d.region, ref.current!) } : d);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (tool === "pointer") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    points.current = [toLocal(e)];
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!points.current.length) return;
    const p = toLocal(e);
    if (tool === "pen") {
      points.current.push(p);
      setLive(pathOf(points.current));
    } else {
      setLiveRegion(regionOf(points.current[0]!, p));
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!points.current.length) return;
    const start = points.current[0]!;
    const end = toLocal(e);
    if (tool === "pen" && points.current.length > 2) {
      const xs = points.current.map((p) => p[0]), ys = points.current.map((p) => p[1]);
      commit({ ink: pathOf(points.current), region: regionOf([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]) });
    } else if (tool === "region") {
      const region = regionOf(start, end);
      if (region.w > 0.01 && region.h > 0.01) commit({ region });
    }
    points.current = [];
    setLive(null);
    setLiveRegion(null);
  };

  const region = (r: NonNullable<Note["region"]>, key: string) => (
    <div key={key} className={styles.region} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
  );

  return (
    <div ref={ref} className={styles.annotations} data-tool={tool} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <svg className={styles.ink} viewBox="0 0 100 100" preserveAspectRatio="none">
        {notes.map((n) => n.ink && n.status === "open" && <path key={n.id} d={n.ink} />)}
        {draft?.ink && <path d={draft.ink} />}
        {live && <path d={live} />}
      </svg>
      {draft?.region && !draft.ink && region(draft.region, "draft")}
      {liveRegion && region(liveRegion, "live")}
      {notes.filter((n) => n.region && n.status !== "dismissed").map((n, i) => {
        const number = numbers?.[n.id] ?? i + 1;
        return (
          <Tooltip key={n.id} content={`Note ${number}`} description={n.text} side="top">
            <button
              type="button"
              className={styles.pin}
              data-status={n.status}
              aria-label={`Note ${number}: ${n.text}`}
              style={{ left: `${n.region!.x * 100}%`, top: `${(n.region!.y + n.region!.h / 2) * 100}%` }}
              onClick={() => onPinClick?.(n.id)}
            >
              {number}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Four invisible markers at the corners of the box it fills. The stage reads
 * them back after every transform to learn where that box lands on the canvas
 * (src/editor/space.ts `measureQuad`). `of` names the box, to find it again.
 */
export function ScreenCorners({ of }: { of: string }) {
  return <span className={styles.corners} data-of={of} aria-hidden><i /><i /><i /><i /></span>;
}

/** A callout bubble rendered at a normalized position on the frame. */
export function Callout({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <motion.div
      className={styles.callout}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ type: "spring", visualDuration: 0.35, bounce: 0 }}
    >
      {children}
    </motion.div>
  );
}

export { styles as stageStyles };
