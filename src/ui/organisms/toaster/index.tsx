/**
 * Toaster: short confirmations from anywhere in the app. Call `toast()` from
 * any code; one `<Toaster />` draws the stack. Toasts say what happened in a
 * few words ("Copied link"), with at most one action (Undo, Retry, Show in
 * Finder). Long work goes through `toast.promise`: rays while it runs, then a
 * ring with a check or cross drawing in, and the text crossfades in place.
 *
 * The newest toast sits at the edge; older ones step back, shrink a little and
 * peek out behind it. Pointing at the stack (or focusing it, F8) fans it out
 * into a list. A hairline along the bottom runs down with each toast's timer
 * and stops while you read. Swipe a toast sideways, press Esc or its close key
 * to dismiss it.
 */
import { isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, RefObject } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Info, X } from "lucide-react";
import { IconKey, Key, StatusGlyph, Swap } from "@/ui/atoms";
import type { GlyphStatus } from "@/ui/atoms";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./toaster.module.css";

/* ───────────────────────── The store ───────────────────────── */

export type ToastId = string;
export type ToastKind = "default" | "success" | "error" | "info" | "loading";

export interface ToastAction {
  label: string;
  /** Closes the toast afterwards unless it calls event.preventDefault(). */
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export interface ToastOptions {
  /** Pass an existing id to update that toast in place: the text crossfades and the timer restarts. */
  id?: ToastId;
  /** One more line, quieter. */
  description?: ReactNode;
  /** One action: Undo, Retry, Show in Finder. */
  action?: ToastAction;
  /** Ms on screen. Infinity keeps it until dismissed. Defaults to the Toaster's. */
  duration?: number;
  /** Shows only in the Toaster with this id, for a second, separate stack. */
  toaster?: string;
  /** Called once it closes, however it closed. */
  onDismiss?: (id: ToastId) => void;
}

interface ToastData extends ToastOptions {
  id: ToastId;
  title: ReactNode;
  kind: ToastKind;
  /** Bumps on every update, so the text crossfades and the timer restarts. */
  version: number;
}

type Message<T> = ReactNode | { title: ReactNode; description?: ReactNode; action?: ToastAction } | ((value: T) => ReactNode | { title: ReactNode; description?: ReactNode; action?: ToastAction });

let toasts: ToastData[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => toasts;

function upsert(title: ReactNode, kind: ToastKind, opts: ToastOptions = {}): ToastId {
  const id = opts.id ?? `toast-${++seq}`;
  const prev = toasts.find((t) => t.id === id);
  const next: ToastData = {
    id, title, kind,
    description: opts.description, action: opts.action, duration: opts.duration,
    toaster: opts.toaster ?? prev?.toaster, onDismiss: opts.onDismiss ?? prev?.onDismiss,
    version: prev ? prev.version + 1 : 0,
  };
  toasts = prev ? toasts.map((t) => (t.id === id ? next : t)) : [...toasts, next];
  emit();
  return id;
}

const isMessage = (m: unknown): m is { title: ReactNode; description?: ReactNode; action?: ToastAction } =>
  typeof m === "object" && m !== null && !isValidElement(m) && !Array.isArray(m) && "title" in m;

function resolve<T>(m: Message<T>, value: T) {
  const v = typeof m === "function" ? m(value) : m;
  return isMessage(v) ? v : { title: v as ReactNode, description: undefined, action: undefined };
}

/** Shows a toast and returns its id. Also toast.success, .error, .info, .loading, .promise and .dismiss. */
export const toast = Object.assign((title: ReactNode, opts?: ToastOptions) => upsert(title, "default", opts), {
  success: (title: ReactNode, opts?: ToastOptions) => upsert(title, "success", opts),
  error: (title: ReactNode, opts?: ToastOptions) => upsert(title, "error", opts),
  info: (title: ReactNode, opts?: ToastOptions) => upsert(title, "info", opts),
  /** Stays until updated or dismissed. */
  loading: (title: ReactNode, opts?: ToastOptions) => upsert(title, "loading", { ...opts, duration: Infinity }),
  /** A loading toast that turns into success or error when the promise settles. Returns the promise. */
  promise<T>(work: Promise<T> | (() => Promise<T>), messages: { loading: Message<void>; success: Message<T>; error: Message<unknown> }, opts?: ToastOptions): Promise<T> {
    const l = resolve(messages.loading, undefined);
    const id = upsert(l.title, "loading", { ...opts, description: l.description, duration: Infinity });
    const p = typeof work === "function" ? work() : work;
    p.then(
      (v) => { const m = resolve(messages.success, v); upsert(m.title, "success", { ...opts, id, description: m.description, action: m.action }); },
      (e: unknown) => { const m = resolve(messages.error, e); upsert(m.title, "error", { ...opts, id, description: m.description, action: m.action }); },
    );
    return p;
  },
  /** Closes one toast, or every toast without an id. */
  dismiss: (id?: ToastId) => {
    const gone = toasts.filter((t) => id === undefined || t.id === id);
    if (!gone.length) return;
    toasts = toasts.filter((t) => !gone.includes(t));
    emit();
    gone.forEach((t) => t.onDismiss?.(t.id));
  },
});

/* ───────────────────────── Text helpers ───────────────────────── */

/** Plain text of a title or description, for the live regions. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Times inside a string ("frame 0:42") set in the time face; everything else stays as written. */
function withTimes(node: ReactNode): ReactNode {
  if (typeof node !== "string") return node;
  const parts = node.split(/(\b\d{1,2}:\d{2}(?:\.\d+)?\b)/);
  return parts.length === 1 ? node : parts.map((p, i) => (i % 2 ? <span key={i} className={styles.time}>{p}</span> : p));
}

const useDocumentHidden = () => useSyncExternalStore(
  (l) => { document.addEventListener("visibilitychange", l); return () => document.removeEventListener("visibilitychange", l); },
  () => document.hidden,
  () => false,
);

/* ───────────────────────── Toaster ───────────────────────── */

export type ToastPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToasterProps {
  /** Corner or edge the stack sits in; new toasts come in from that edge. */
  position?: ToastPosition;
  /** Position inside the nearest positioned ancestor instead of the window. */
  inline?: boolean;
  /** Shows only toasts sent with { toaster: id }. */
  id?: string;
  /** Default ms on screen. */
  duration?: number;
  /** Toasts shown at once; older ones wait, timers paused, until there's room. */
  visibleToasts?: number;
  /** Keep the stack fanned out instead of only on hover and focus. */
  expand?: boolean;
  /** Distance from the edges in px. Default 24, 20 inline. */
  offset?: number;
  /** Space between toasts when fanned out, in px. */
  gap?: number;
  /** Key (KeyboardEvent.key or .code) that focuses the newest toast. null turns it off. */
  hotkey?: string | null;
  /** A 1px line along the bottom that runs down with the timer. */
  hairline?: boolean;
  /** A close key on hover and focus. */
  closeButton?: boolean;
  /** Names the region for assistive tech; the hotkey is added. */
  label?: string;
  className?: string;
}

/** How far each older toast peeks out behind the one in front, and how much smaller it gets. */
const PEEK = 9;
const SHRINK = 0.05;
type Place = { y: number; scale: number; height: number | "auto"; shown: boolean; behind: boolean };

export function Toaster({
  position = "bottom-right", inline, id, duration = 4000, visibleToasts = 3, expand = false, offset, gap = 10,
  hotkey = "F8", hairline = true, closeButton = true, label = "Notifications", className,
}: ToasterProps) {
  const uid = useId();
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  const front = all.filter((t) => t.toaster === id).reverse();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [polite, setPolite] = useState("");
  const [urgent, setUrgent] = useState("");
  const hidden = useDocumentHidden();
  const region = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const swipes = useRef(new Map<string, number>());
  const announced = useRef(new Map<string, number>());

  const open = expand || hovered || focused;
  const paused = hovered || focused || hidden;
  const bottom = position.startsWith("bottom");
  // Older toasts stack away from the edge: up from the bottom, down from the top.
  const away = bottom ? -1 : 1;
  const domId = (tid: string) => `${uid}-${tid}`;

  const setHeight = useCallback((tid: string, h: number) => setHeights((m) => (m[tid] === h ? m : { ...m, [tid]: h })), []);

  // Forget the heights of toasts that are gone.
  useEffect(() => {
    setHeights((m) => {
      const keep = Object.fromEntries(Object.entries(m).filter(([k]) => all.some((t) => t.id === k)));
      return Object.keys(keep).length === Object.keys(m).length ? m : keep;
    });
  }, [all]);

  // New and updated toasts are read out once: errors in the alert region, the rest politely.
  useEffect(() => {
    for (const t of front) {
      if (announced.current.get(t.id) === t.version) continue;
      announced.current.set(t.id, t.version);
      const text = [textOf(t.title), textOf(t.description)].filter(Boolean).join(". ");
      if (t.kind === "error") setUrgent(text); else setPolite(text);
    }
  });

  // The hotkey moves focus to the newest toast, which fans the stack out.
  const newest = front[0]?.id;
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.key !== hotkey && e.code !== hotkey) || !newest) return;
      e.preventDefault();
      if (!region.current?.contains(document.activeElement)) returnTo.current = document.activeElement as HTMLElement | null;
      document.getElementById(domId(newest))?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, newest]);

  /** Esc: close this toast and move focus to the next one, or back where it was after the last. */
  const closeByKey = (tid: string) => {
    const at = front.findIndex((t) => t.id === tid);
    const next = front[at + 1] ?? front[at - 1];
    toast.dismiss(tid);
    requestAnimationFrame(() => {
      const el = next && document.getElementById(domId(next.id));
      if (el) el.focus();
      else { returnTo.current?.focus?.(); returnTo.current = null; }
    });
  };

  // Where each toast goes: collapsed, a stack peeking out behind the newest; open, a list.
  const frontH = heights[front[0]?.id ?? ""] ?? 0;
  let reach = 0;
  const places: Place[] = front.map((t, i) => {
    const shown = i < visibleToasts;
    const depth = Math.min(i, visibleToasts - 1);
    const h = heights[t.id];
    const place: Place = open
      ? { y: away * reach, scale: 1, height: h ?? "auto", shown, behind: false }
      : { y: away * depth * PEEK, scale: 1 - depth * SHRINK, height: i === 0 ? h ?? "auto" : frontH || "auto", shown, behind: i > 0 };
    if (shown) reach += (h ?? 0) + gap;
    return place;
  });
  const stackH = open ? Math.max(reach - gap, 0) : frontH + PEEK * Math.max(Math.min(front.length, visibleToasts) - 1, 0);

  return (
    <MotionConfig reducedMotion="user">
      <section ref={region} aria-label={hotkey ? `${label} (${hotkey})` : label} tabIndex={-1}
        className={[styles.region, className].filter(Boolean).join(" ")} data-position={position} data-inline={inline || undefined}
        style={{ "--offset": `${offset ?? (inline ? 20 : 24)}px` } as CSSProperties}
        onFocus={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) returnTo.current ??= e.relatedTarget as HTMLElement | null; }}>
        <ol className={styles.stack} style={{ "--stack-h": `${stackH}px` } as CSSProperties}
          onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}>
          <AnimatePresence initial={false} custom={swipes.current}>
            {front.map((t, i) => (
              <ToastItem key={t.id} data={t} domId={domId(t.id)} place={places[i]!} edge={-away} bottom={bottom}
                held={paused || !places[i]!.shown} duration={duration} hairline={hairline} closeButton={closeButton}
                onHeight={setHeight} swipes={swipes} onEscape={closeByKey} />
            ))}
          </AnimatePresence>
        </ol>
        <span className="visually-hidden" role="status" aria-live="polite">{polite}</span>
        <span className="visually-hidden" role="alert">{urgent}</span>
      </section>
    </MotionConfig>
  );
}

/* ───────────────────────── One toast ───────────────────────── */

interface ToastItemProps {
  data: ToastData;
  domId: string;
  place: Place;
  /** +1 when the edge is below (bottom stacks), −1 when above. */
  edge: number;
  bottom: boolean;
  /** Timer paused: pointer or focus in the stack, tab hidden, or waiting for room. */
  held: boolean;
  duration: number;
  hairline: boolean;
  closeButton: boolean;
  onHeight: (id: string, h: number) => void;
  swipes: RefObject<Map<string, number>>;
  onEscape: (id: string) => void;
}

const SWIPE_PX = 64;
const SWIPE_SPEED = 480;

function ToastItem({ data: t, domId, place, edge, bottom, held, duration, hairline, closeButton, onHeight, swipes, onEscape }: ToastItemProps) {
  const content = useRef<HTMLDivElement>(null);
  const dur = t.kind === "loading" ? Infinity : t.duration ?? duration;
  const timed = Number.isFinite(dur);
  const remaining = useRef(dur);

  // Every toast is measured, so the stack can place and size it.
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const report = () => onHeight(t.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [t.id, onHeight]);

  // An update restarts the clock; holding pauses it and keeps what's left.
  useEffect(() => { remaining.current = dur; }, [t.version, dur]);
  useEffect(() => {
    if (held || !timed) return;
    const started = Date.now();
    const timer = window.setTimeout(() => toast.dismiss(t.id), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [held, timed, t.version, t.id]);

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onEscape(t.id);
  };

  return (
    <motion.li id={domId} tabIndex={0} className={styles.toast} data-kind={t.kind} data-behind={place.behind || undefined} data-edge={bottom ? "bottom" : "top"}
      inert={!place.shown || undefined} onKeyDown={onKeyDown}
      custom={swipes.current}
      initial={{ opacity: 0, y: edge * 48, scale: 0.97, filter: `blur(${motionTokens.blur.subtle}px)` }}
      animate={{ opacity: place.shown ? 1 : 0, y: place.y, scale: place.scale, height: place.height, filter: "blur(0px)" }}
      exit="gone"
      variants={{
        // Swiped: flies out the way it was thrown. Closed: fades and sinks a few px while the rest move up.
        gone: (s: Map<string, number>) => {
          const dir = s.get(t.id);
          return dir
            ? { x: dir * 420, opacity: 0, transition: { duration: 0.24, ease: motionTokens.ease.standard } }
            : { opacity: 0, y: place.y + 6, scale: place.scale * 0.98, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit } };
        },
      }}
      transition={{ default: motionTokens.spring.smooth, opacity: { duration: 0.2 }, filter: { duration: motionTokens.duration.standard } }}
      drag={place.shown ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5} dragSnapToOrigin
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) < SWIPE_PX && Math.abs(info.velocity.x) < SWIPE_SPEED) return;
        swipes.current.set(t.id, Math.sign(info.offset.x || info.velocity.x));
        toast.dismiss(t.id);
      }}>
      <div ref={content} className={styles.content}>
        <ToastIcon kind={t.kind} />
        <Swap id={`v${t.version}`} inline={false} className={styles.text}>
          <span className={styles.title}>{withTimes(t.title)}</span>
          {t.description && <span className={styles.description}>{withTimes(t.description)}</span>}
        </Swap>
        {t.action && (
          <Swap id={t.action.label} className={styles.action}>
            <Key size="sm" onClick={(e) => { t.action?.onClick(e); if (!e.defaultPrevented) toast.dismiss(t.id); }}>{t.action.label}</Key>
          </Swap>
        )}
        {closeButton && <IconKey size="sm" label="Close" tooltip={false} className={styles.close} onClick={() => toast.dismiss(t.id)}><X /></IconKey>}
      </div>
      {hairline && timed && <span key={t.version} className={styles.hairline} data-held={held || undefined} style={{ "--life": `${dur}ms` } as CSSProperties} />}
    </motion.li>
  );
}

/**
 * Loading shows rays. Success and error close them into a ring while a check
 * or cross draws itself; a toast that starts finished draws in the same way.
 */
function ToastIcon({ kind }: { kind: ToastKind }) {
  const target: GlyphStatus | null = kind === "loading" ? "running" : kind === "success" ? "done" : kind === "error" ? "failed" : null;
  // A toast that starts finished paints its empty ring first, so the mark draws in on the next frame.
  const [status, setStatus] = useState<GlyphStatus>(target === "running" ? "running" : "queued");
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => setStatus(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  if (kind === "info") return <span className={styles.icon}><Info aria-hidden /></span>;
  if (!target) return null;
  return (
    <span className={styles.icon} data-ring={status === "done" || status === "failed" ? status : undefined}>
      <span className={styles.ring} aria-hidden />
      <StatusGlyph status={status} size={13} />
    </span>
  );
}
