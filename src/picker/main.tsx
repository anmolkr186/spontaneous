import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "@/ui/tokens/tokens.css";
import { trackInputModality } from "@/ui/tokens/input-modality";
import { Kbd, Key } from "@/ui/atoms";
import { capture } from "@/platform/capture";
import type { WindowSource } from "@/platform/capture";
import { isTauri } from "@/platform/tauri";
import styles from "./picker.module.css";

/**
 * Full-display overlay for choosing what to record.
 *   area    drag a rectangle; move it or resize from the corners; Enter to use it.
 *   window  the window under the cursor is highlighted; click to choose it.
 * Esc always cancels. Coordinates are global points: window origin + client point.
 *
 * Keys arrive as `picker-key` events from global shortcuts the app registers
 * while the picker is open, so they work in one press even after Cmd-Tab.
 */

type PickerKey = "escape" | "enter" | "next" | "prev";

/** Picker keys from the app, with a DOM fallback for the browser build. */
function usePickerKeys(handler: (key: PickerKey) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (isTauri) {
      const off = listen<PickerKey>("picker-key", (e) => ref.current(e.payload));
      return () => void off.then((f) => f());
    }
    const map: Record<string, PickerKey> = { Escape: "escape", Enter: "enter", ArrowDown: "next", ArrowRight: "next", ArrowUp: "prev", ArrowLeft: "prev" };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key === "Tab" ? (e.shiftKey ? "prev" : "next") : map[e.key];
      if (key) { e.preventDefault(); ref.current(key); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "window" ? "window" : "area";
document.title = mode === "window" ? "Select a window" : "Select an area";

type Box = { x: number; y: number; w: number; h: number };
type Drag = { kind: "draw" | "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; from: Box };

const reveal = { type: "spring", visualDuration: 0.22, bounce: 0 } as const;

function useOrigin() {
  // The window may be nudged below the menu bar; read where it really is.
  const [origin, setOrigin] = useState({ x: Number(params.get("x") ?? 0), y: Number(params.get("y") ?? 0) });
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    void Promise.all([win.outerPosition(), win.scaleFactor()]).then(([p, s]) => setOrigin({ x: p.x / s, y: p.y / s }));
  }, []);
  return origin;
}

function Picker() {
  const origin = useOrigin();
  const cancel = useCallback(() => void (mode === "window" ? capture.windowDone(null) : capture.areaDone(null)), []);
  return mode === "window" ? <WindowPicker origin={origin} onCancel={cancel} /> : <AreaPicker origin={origin} onCancel={cancel} />;
}

/* ───────────────────────── Window ───────────────────────── */

function WindowPicker({ origin, onCancel }: { origin: { x: number; y: number }; onCancel: () => void }) {
  const [windows, setWindows] = useState<WindowSource[]>([]);
  const [hover, setHover] = useState<WindowSource | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // Keep stacking order live: Cmd-Tab, clicks and Mission Control reorder windows
  // while the picker is open, and the highlight should follow what's on top.
  useEffect(() => {
    let alive = true;
    const load = () => void capture.sources().then((s) => {
      if (!alive) return;
      setWindows(s.windows);
      setHover((h) => {
        if (pointer.current) return hitIn(s.windows, pointer.current.x, pointer.current.y);
        return h ? s.windows.find((w) => w.id === h.id) ?? null : null;
      });
    }).catch(() => {});
    load();
    const id = setInterval(load, 600);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const hitIn = (list: WindowSource[], clientX: number, clientY: number) => {
    const gx = clientX + origin.x, gy = clientY + origin.y;
    return list.find((w) => gx >= w.frame.x && gx <= w.frame.x + w.frame.width && gy >= w.frame.y && gy <= w.frame.y + w.frame.height) ?? null;
  };
  const choose = (w: WindowSource) => void capture.windowDone({ id: w.id, appName: w.appName, title: w.title });

  usePickerKeys((key) => {
    if (key === "escape") return onCancel();
    if (key === "enter") { if (hover) choose(hover); return; }
    if (!windows.length) return;
    // Tab / arrows step through windows front to back, like the app switcher.
    pointer.current = null;
    const i = hover ? windows.findIndex((w) => w.id === hover.id) : -1;
    const next = key === "next" ? (i + 1) % windows.length : (i - 1 + windows.length) % windows.length;
    setHover(windows[next]!);
  });

  const box = hover && { x: hover.frame.x - origin.x, y: hover.frame.y - origin.y, w: hover.frame.width, h: hover.frame.height };

  return (
    <div
      className={styles.picker}
      data-mode="window"
      onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; setHover(hitIn(windows, e.clientX, e.clientY)); }}
      onPointerLeave={() => { pointer.current = null; setHover(null); }}
      onClick={() => hover && choose(hover)}
      onContextMenu={(e) => { e.preventDefault(); onCancel(); }}
    >
      <div className={styles.dim} style={box ? { clipPath: hole(box) } : undefined} />
      <AnimatePresence>
        {box && hover && (
          <motion.div
            key={hover.id}
            className={styles.windowHighlight}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: box.x, top: box.y, width: box.w, height: box.h }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ opacity: { duration: 0.12 }, default: { duration: 0 } }}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          >
            <span className={styles.windowLabel}>
              <b>{hover.appName}</b>
              {hover.title !== hover.appName && <span>{hover.title}</span>}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <Hint keys={["tab", "to cycle"]}>Click a window to record it</Hint>
    </div>
  );
}

/* ───────────────────────── Area ───────────────────────── */

const MIN = 40;

function AreaPicker({ origin, onCancel }: { origin: { x: number; y: number }; onCancel: () => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const confirm = useCallback((b: Box) => {
    void capture.areaDone({ x: Math.round(origin.x + b.x), y: Math.round(origin.y + b.y), width: Math.round(b.w), height: Math.round(b.h) });
  }, [origin]);

  usePickerKeys((key) => {
    if (key === "escape") onCancel();
    else if (key === "enter" && box && box.w >= MIN && box.h >= MIN) confirm(box);
  });

  const start = (kind: Drag["kind"]) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const from = kind === "draw" ? { x: e.clientX, y: e.clientY, w: 0, h: 0 } : box!;
    drag.current = { kind, startX: e.clientX, startY: e.clientY, from };
    setDragging(true);
    if (kind === "draw") setBox(from);
  };
  const move = (e: ReactPointerEvent) => {
    setPointer({ x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY, f = d.from;
    const clamp = (b: Box): Box => ({ x: Math.max(0, Math.min(innerWidth - b.w, b.x)), y: Math.max(0, Math.min(innerHeight - b.h, b.y)), w: b.w, h: b.h });
    const fromCorners = (x1: number, y1: number, x2: number, y2: number): Box => ({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
    switch (d.kind) {
      case "draw": setBox(fromCorners(d.startX, d.startY, e.clientX, e.clientY)); break;
      case "move": setBox(clamp({ ...f, x: f.x + dx, y: f.y + dy })); break;
      case "nw": setBox(fromCorners(f.x + f.w, f.y + f.h, f.x + dx, f.y + dy)); break;
      case "ne": setBox(fromCorners(f.x, f.y + f.h, f.x + f.w + dx, f.y + dy)); break;
      case "sw": setBox(fromCorners(f.x + f.w, f.y, f.x + dx, f.y + f.h + dy)); break;
      case "se": setBox(fromCorners(f.x, f.y, f.x + f.w + dx, f.y + f.h + dy)); break;
    }
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
    setBox((b) => (b && (b.w < MIN || b.h < MIN) ? null : b));
  };

  const ready = !!box && box.w >= MIN && box.h >= MIN && !dragging;

  return (
    <div className={styles.picker} data-mode="area" onPointerDown={start("draw")} onPointerMove={move} onPointerUp={end}
      onContextMenu={(e) => { e.preventDefault(); onCancel(); }}>
      <div className={styles.dim} style={box ? { clipPath: hole(box) } : undefined} />

      {!box && pointer && (
        <>
          <span className={styles.guideX} style={{ top: pointer.y }} />
          <span className={styles.guideY} style={{ left: pointer.x }} />
        </>
      )}

      {box && (
        <div className={styles.selection} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDown={start("move")} data-dragging={dragging || undefined}>
          {(["nw", "ne", "sw", "se"] as const).map((c) => <span key={c} className={styles.handle} data-corner={c} onPointerDown={start(c)} />)}
          <span className={styles.size}>{Math.round(box.w)} × {Math.round(box.h)}</span>
        </div>
      )}

      <AnimatePresence>
        {ready && box && (
          <motion.div
            className={styles.actions}
            style={{ left: box.x + box.w / 2, top: box.y + box.h + 56 > innerHeight ? box.y + box.h - 48 : box.y + box.h + 12 }}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.11, ease: [0.4, 0, 1, 1] } }}
            transition={reveal}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Key size="sm" variant="tertiary" onClick={onCancel}>Cancel</Key>
            <Key size="sm" variant="primary" onClick={() => confirm(box)}>Record this area</Key>
          </motion.div>
        )}
      </AnimatePresence>

      {!box && <Hint>Drag to select an area</Hint>}
    </div>
  );
}

/* ───────────────────────── Shared ───────────────────────── */

/** clip-path that dims everything except the box. */
function hole(b: Box) {
  const r = 8;
  return `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${b.x + r} ${b.y}H${b.x + b.w - r}Q${b.x + b.w} ${b.y} ${b.x + b.w} ${b.y + r}V${b.y + b.h - r}Q${b.x + b.w} ${b.y + b.h} ${b.x + b.w - r} ${b.y + b.h}H${b.x + r}Q${b.x} ${b.y + b.h} ${b.x} ${b.y + b.h - r}V${b.y + r}Q${b.x} ${b.y} ${b.x + r} ${b.y}Z")`;
}

function Hint({ children, keys }: { children: string; keys?: [string, string] }) {
  return (
    <motion.div className={styles.hint} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={reveal}>
      {children}
      {keys && <span className={styles.hintKeys}><Kbd>{keys[0]}</Kbd>{keys[1]}</span>}
      <span className={styles.hintKeys}><Kbd>esc</Kbd>to cancel</span>
    </motion.div>
  );
}

trackInputModality();
createRoot(document.getElementById("root")!).render(<StrictMode><Picker /></StrictMode>);
