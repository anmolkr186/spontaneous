import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import "@/ui/tokens/tokens.css";
import { trackInputModality } from "@/ui/tokens/input-modality";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Key, Mark } from "@/ui/atoms";
import { DockNotice, RecorderDock } from "@/ui/organisms/dock";
import type { RecordSource, RecorderPhase } from "@/ui/organisms/dock";
import { capture, recordingName } from "@/platform/capture";
import type { PermissionsStatus, PickedWindow, Rect, Sources, Target } from "@/platform/capture";
import { isTauri } from "@/platform/tauri";
import styles from "./recorder.module.css";

const params = new URLSearchParams(location.search);
const initialSource = (params.get("source") ?? "display") as RecordSource;
/** Debug builds only: record for N seconds and stop, to test the full path without clicking. */
const autoRecord = import.meta.env.DEV ? Number(params.get("autorecord") ?? 0) : 0;
/** Set on app launch: play the icon intro before the dock appears. */
const playIntro = params.get("intro") === "1";

/**
 * Launch intro, in two beats:
 *   land  the icon settles in, sharp, and holds for a moment so it reads clearly
 *   zoom  it rushes toward you, growing far past the window, with a trail of
 *         lagging copies for zoom blur, and dissolves into the dock's arrival
 */
const ZOOM_SCALE = 7.5;
const ICON = 120;
const LAND_HOLD = 820;
const ZOOM_MS = 620;
/** Lagging copies behind the icon during the zoom: the radial blur. */
const TRAILS = [0.05, 0.1, 0.16, 0.23];

function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState<"land" | "zoom">("land");
  useEffect(() => {
    if (reduced) {
      const id = setTimeout(onDone, 600);
      return () => clearTimeout(id);
    }
    const zoom = setTimeout(() => setBeat("zoom"), LAND_HOLD);
    const done = setTimeout(onDone, LAND_HOLD + ZOOM_MS - 40);
    return () => { clearTimeout(zoom); clearTimeout(done); };
  }, [onDone, reduced]);

  // Accelerates away like a camera dolly punching through; blur builds with speed.
  const rush = { duration: ZOOM_MS / 1000, ease: [0.55, 0, 0.85, 0.3] } as const;
  const zoomTo = { scale: ZOOM_SCALE, opacity: [1, 1, 0], filter: ["blur(0px)", "blur(3px)", "blur(26px)"] };
  const zoomTiming = { ...rush, opacity: { ...rush, times: [0, 0.3, 1] }, filter: { ...rush, times: [0, 0.35, 1] } };

  if (reduced) {
    return (
      <motion.div className={styles.intro} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        <Mark size={ICON} title="Spontaneous" />
      </motion.div>
    );
  }
  return (
    <motion.div className={styles.intro} exit={{ opacity: 0, transition: { duration: 0 } }}>
      {/* A soft bloom behind the icon that opens out as it comes at you. */}
      <motion.span className={styles.bloom}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={beat === "land" ? { scale: 1, opacity: 0.55 } : { scale: 6, opacity: 0 }}
        transition={beat === "land" ? { duration: 0.6, ease: [0.16, 1, 0.3, 1] } : rush} />
      {beat === "zoom" && TRAILS.map((lag, i) => (
        <motion.span key={i} className={styles.layer} initial={{ scale: 1, opacity: 0.32 - i * 0.06 }}
          animate={{ ...zoomTo, opacity: [0.32 - i * 0.06, 0.24 - i * 0.05, 0] }} transition={{ ...zoomTiming, delay: lag * (ZOOM_MS / 1000) }}>
          <Mark size={ICON} title="" />
        </motion.span>
      ))}
      <motion.span className={styles.layer}
        initial={{ scale: 0.72, opacity: 0, filter: "blur(10px)" }}
        animate={beat === "land" ? { scale: 1, opacity: 1, filter: "blur(0px)" } : zoomTo}
        transition={beat === "land" ? { type: "spring", visualDuration: 0.55, bounce: 0.18, opacity: { duration: 0.3 }, filter: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } : zoomTiming}>
        <Mark size={ICON} title="Spontaneous" />
      </motion.span>
    </motion.div>
  );
}

/**
 * The recorder window: a transparent, always-on-top window holding the
 * recorder dock. It sizes itself to its content with the bottom edge fixed,
 * so notices grow upward and it never covers more screen than it needs.
 */
function Recorder() {
  const [intro, setIntro] = useState(playIntro);
  const [phase, setPhase] = useState<RecorderPhase>("setup");
  const [source, setSource] = useState<RecordSource>(initialSource);
  const [sources, setSources] = useState<Sources | null>(null);
  const [perms, setPerms] = useState<PermissionsStatus | null>(null);
  const [picked, setPicked] = useState<PickedWindow | null>(null);
  const [area, setArea] = useState<Rect | null>(null);
  const [mic, setMic] = useState(false);
  const [system, setSystem] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    // Permissions first: listing sources without Screen Recording makes macOS prompt again.
    const p = await capture.permissions();
    setPerms(p);
    if (p.screen !== "granted") return;
    const s = await capture.sources().catch(() => null);
    if (s) setSources(s);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    const unlisteners = [
      capture.onAreaPicked((rect) => { if (rect) { setArea(rect); setSource("area"); } }),
      capture.onWindowPicked((w) => { if (w) { setPicked(w); setSource("window"); } }),
      isTauri ? listen<string>("recorder-source", (e) => setSource(e.payload as RecordSource)) : Promise.resolve(() => {}),
    ];
    return () => {
      window.removeEventListener("focus", refresh);
      unlisteners.forEach((u) => void u.then((f) => f()));
    };
  }, [refresh]);

  /** Window and Area are chosen on screen, in the picker overlay. */
  const pick = (mode: "window" | "area") => {
    const display = sources?.displays.find((d) => d.isMain) ?? sources?.displays[0];
    if (display && isTauri) void capture.pick(mode, display.frame);
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(async () => {
      const t = await capture.elapsed().catch(() => null);
      if (typeof t === "number") setElapsed(t);
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "recording") void stop();
      else if (phase === "setup") void close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dockAnchor = useAutoSize(rootRef);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoRecord || intro || autoStarted.current || !sources || !perms) return;
    autoStarted.current = true;
    void record().then(() => setTimeout(() => void stop(), autoRecord * 1000));
  });

  const display = sources?.displays.find((d) => d.isMain) ?? sources?.displays[0];
  const target: Target | null =
    source === "display" && display ? { kind: "display", displayId: display.id }
      : source === "window" && picked ? { kind: "window", windowId: picked.id }
        : source === "area" && display && area ? { kind: "area", displayId: display.id, rect: area }
          : null;
  const screenOk = perms?.screen === "granted";
  const blocked = !screenOk ? "Allow Screen Recording first"
    : source === "window" && !picked ? "Choose a window"
      : source === "area" && !area ? "Select an area"
        : null;

  const record = async () => {
    if (!target) return;
    setError(null);
    setPhase("starting");
    try {
      await capture.start(recordingName(), { target, fps: 60, systemAudio: system, microphone: mic && perms?.microphone === "granted", codec: "h264" });
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      setError(String(err));
      setPhase("setup");
    }
  };
  const stop = async () => {
    setPhase("stopping");
    try { await capture.stop(); } catch (err) { setError(String(err)); setPhase("recording"); }
  };
  const discard = async () => {
    try { await capture.discard(); } catch (err) { setError(String(err)); }
  };
  const close = async () => { if (isTauri) await getCurrentWindow().close(); };

  const above = phase === "setup" && (
    !screenOk && perms ? (
      <DockNotice>
        <span style={{ flex: 1 }}><b>Screen Recording is off.</b> Spontaneous needs it to see your screen.</span>
        <Key size="sm" variant="primary" onClick={async () => { await capture.requestPermission("screen"); await capture.openSettings("screen"); }}>Allow</Key>
      </DockNotice>
    ) : error ? (
      <DockNotice><span style={{ color: "var(--rec)" }}>{error}</span></DockNotice>
    ) : null
  );

  return (
    <div ref={rootRef} className={styles.root} data-intro={intro || undefined}>
      <AnimatePresence mode="wait">
        {intro ? <Intro key="intro" onDone={() => { dockAnchor.current = true; setIntro(false); }} /> : (
          <motion.div key="dock" initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", visualDuration: 0.36, bounce: 0 }}>
      <RecorderDock
        phase={phase}
        source={source}
        onSource={(s) => { setError(null); if (s === "display") setSource(s); else pick(s); }}
        onClearSource={(s) => { if (s === "window") setPicked(null); else setArea(null); setSource("display"); }}
        labels={{
          display: display && sources && sources.displays.length > 1 ? display.name : undefined,
          window: picked ? picked.appName : undefined,
          area: area ? `${area.width} × ${area.height}` : undefined,
        }}
        microphone={mic}
        onMicrophone={(on) => { setMic(on); if (on && perms?.microphone !== "granted") void capture.requestPermission("microphone"); }}
        systemAudio={system}
        onSystemAudio={setSystem}
        blocked={blocked}
        elapsed={elapsed}
        onRecord={record}
        onStop={stop}
        onDiscard={discard}
        onClose={close}
        above={above}
      />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Resize the window to its content. Normally the bottom edge and centre stay
 * put (so a user-dragged dock stays where they left it). After the intro, which
 * plays mid-screen, the next resize moves the window down to the dock position.
 */
function useAutoSize(ref: React.RefObject<HTMLDivElement | null>) {
  const dockAnchor = useRef(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !isTauri) return;
    const win = getCurrentWindow();
    let busy = Promise.resolve();
    const observer = new ResizeObserver(() => {
      const w = Math.ceil(node.offsetWidth), h = Math.ceil(node.offsetHeight);
      busy = busy.then(async () => {
        const [pos, size, scale] = await Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()]);
        const cur = { x: pos.x / scale, y: pos.y / scale, w: size.width / scale, h: size.height / scale };
        if (Math.abs(cur.w - w) < 1 && Math.abs(cur.h - h) < 1) return;
        let next = { x: cur.x + (cur.w - w) / 2, y: cur.y + (cur.h - h) };
        if (dockAnchor.current) {
          dockAnchor.current = false;
          const m = await currentMonitor();
          if (m) {
            const ms = m.scaleFactor, mx = m.position.x / ms, my = m.position.y / ms, mw = m.size.width / ms, mh = m.size.height / ms;
            next = { x: mx + (mw - w) / 2, y: my + mh - h - DOCK_BOTTOM };
          }
        }
        await win.setPosition(new LogicalPosition(next.x, next.y));
        await win.setSize(new LogicalSize(w, h));
      }).catch(() => {});
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return dockAnchor;
}

/** Gap between the dock window and the bottom of the screen (matches the Rust side). */
const DOCK_BOTTOM = 96;

trackInputModality();
createRoot(document.getElementById("root")!).render(<StrictMode><Recorder /></StrictMode>);
