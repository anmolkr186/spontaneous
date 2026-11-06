import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Clapperboard, Film, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pause, Play, Redo2, RotateCcw, Scissors, Share, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/ui/base/slider/slider";
import { Switch } from "@/ui/base/switch/switch";
import { ScrubInput } from "@/ui/base/scrub-input/scrub-input";
import { Cell, IconKey, Key, Mark, Timecode } from "@/ui/atoms";
import { Field, Group, Hint, NoteCard, Panel, SwatchPicker, Switcher } from "@/ui/molecules";
import { EXTRA_TONES, ScreenArt, ShotCard, ShotScene, standInTone } from "@/ui/organisms/shot";
import { AnnotationLayer, Callout, Camera, CanvasViewport, Cursor, DeviceFrame, ScreenCorners, VideoScreen, stageStyles, useElementSize } from "@/ui/organisms/stage";
import type { DeviceKind } from "@/ui/organisms/stage";
import { AnnotationDock, Dock, DockDivider, DockTool } from "@/ui/organisms/dock";
import { ClipItem, NoteMarker, Timeline, Track, TrackItem, Transport, Waveform, fitPps } from "@/ui/organisms/timeline";
import { AgentConnect, AgentEmpty, AgentThread, CliUpdateNotice } from "@/ui/organisms/agent";
import { Toaster } from "@/ui/organisms/toaster";
import { AgentRuntimeProvider, useAgentStoreRuntime } from "@/ui/organisms/agent/runtime";
import type { AgentMessage, AppendMessage } from "@/ui/organisms/agent/runtime";
import { capture } from "@/platform/capture";
import type { RecordingSummary } from "@/platform/capture";
import { call, isTauri } from "@/platform/tauri";
import { BACKGROUNDS, backdrop, formatTime, pinNumbers } from "./model";
import { PRIMITIVES, SHOTS, SHOT_SETS, poseAt, shotById, shotLength } from "./shots";
import type { Shot, ShotSet } from "./shots";
import type { Aspect, BackdropSet, Project, Rect } from "./model";
import { canvasToRecording, measureQuad } from "./space";
import { activeZoom, useEditor } from "./store";
import type { EditorMode, InspectorTab } from "./store";
import { useAgent } from "./agent";
import { useAgentUpdate } from "./agent-update";
import { AgentAbove, AgentComposerBar, AgentMenu, useAgentActions } from "./agent-panel";
import { ChangesPane } from "./ChangesPane";
import { CommandPalette } from "./CommandPalette";
import { CtaKey, CtaRegion, CtaRoot, exportLabel, notesLabel } from "@/ui/cta";
import { cursorAtTime, projectFromRecording } from "./recording";
import styles from "./editor.module.css";

export function Editor() {
  usePlayback();
  useShortcuts();
  useRecordingEvents();
  useAutosave();
  useAgentConnection();
  const runtime = useAgentRuntime();
  const mode = useEditor((s) => s.mode);
  const hasRecording = useEditor((s) => !!s.project.recording);
  const previewing = useEditor((s) => s.preview) || !hasRecording;
  const panels = useEditor((s) => s.panels);
  const moved = usePanelMotion(panels);
  if (isTauri && !hasRecording) return <NewProject />;
  return (
    <AgentRuntimeProvider runtime={runtime}>
      {/* One election for the window: each region below shows one primary, and Export waits while work is pending. */}
      <CtaRoot>
      <div className={styles.app} data-mode={mode} data-preview={previewing || undefined}
        data-left-closed={!panels.left || undefined} data-right-closed={!panels.right || undefined}
        data-moved-left={moved.left || undefined} data-moved-right={moved.right || undefined}>
        <TopBar />
        {mode === "studio" && <Inspector />}
        <Stage />
        <SidePanel />
        <AgentUpdate />
        {mode === "studio" ? <TimelinePanel /> : !previewing && <ScrubBar />}
      </div>
      <Toaster position="bottom-left" />
      <CommandPalette />
      </CtaRoot>
    </AgentRuntimeProvider>
  );
}

/**
 * Which sidebars have been toggled since the editor opened. Their slide-and-blur
 * only runs after a toggle, so nothing animates on load.
 */
function usePanelMotion(panels: { left: boolean; right: boolean }) {
  const [moved, setMoved] = useState({ left: false, right: false });
  const last = useRef(panels);
  useEffect(() => {
    const prev = last.current;
    last.current = panels;
    if (prev.left !== panels.left || prev.right !== panels.right) {
      setMoved((m) => ({ left: m.left || prev.left !== panels.left, right: m.right || prev.right !== panels.right }));
    }
  }, [panels]);
  return moved;
}

/** Every project starts as a recording. Shown when the editor is opened before one exists. */
function NewProject() {
  return (
    <div className={styles.newProject} data-tauri-drag-region>
      <Mark size={56} title="" />
      <h1>Start with a recording</h1>
      <p>Record a display, a window or an area. When you stop, the project opens here.</p>
      <div className={styles.newActions}>
        <Key variant="primary" size="lg" onClick={() => void capture.openRecorder("display")}>Record</Key>
        <Key variant="tertiary" size="lg" onClick={() => void capture.openRecorder("area")}>Record an area</Key>
      </div>
    </div>
  );
}

/* ───────────────────────── Runtime + effects ───────────────────────── */

function useAgentRuntime() {
  const messages = useAgent((s) => s.messages);
  const running = useAgent((s) => s.running);
  return useAgentStoreRuntime<AgentMessage>({
    messages,
    isRunning: running,
    convertMessage: (m) => m,
    onNew: async (message: AppendMessage) => {
      const text = message.content.map((p) => (p.type === "text" ? p.text : "")).join("\n").trim();
      if (text) useAgent.getState().send(text);
    },
    onCancel: async () => useAgent.getState().cancel(),
    onAddToolResult: ({ toolCallId, result }) => {
      useAgent.getState().answer(toolCallId, result);
    },
  });
}

/**
 * Checks the CLI on load and when the window comes back, which is when a browser
 * sign-in or a fresh install would have changed things.
 */
function useAgentConnection() {
  useEffect(() => {
    const check = () => { if (useAgent.getState().connection.phase !== "ready") void useAgent.getState().checkConnection(); };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);
}

/**
 * A finished recording becomes the open project. The app holds the last one, so
 * the editor asks for it on load and whenever its window comes back, as well as
 * listening for the event: a reload or a hidden, throttled window never misses it.
 */
function useRecordingEvents() {
  useEffect(() => {
    const open = (summary: RecordingSummary | null) => {
      if (!summary) return;
      const { project, loadProject } = useEditor.getState();
      if (project.recording?.projectDir === summary.projectDir) return;
      loadProject(projectFromRecording(summary, project));
      useAgent.getState().reset();
    };
    const pull = () => void capture.lastFinished().then(open).catch(() => {});
    pull();
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", pull);
    const off = capture.onFinished(open);
    return () => {
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", pull);
      void off.then((f) => f());
    };
  }, []);
}

/** Save the open recording's edit list into its package, half a second after the last change. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useEditor.subscribe((state, prev) => {
      const project = state.project;
      if (project === prev.project || !project.recording) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { recording, ...edits } = project;
        void call("project_save", { dir: recording!.projectDir, project: { ...edits, recording: { width: recording!.width, height: recording!.height } } });
      }, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);
}

function usePlayback() {
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const { time, project, seek, setPlaying } = useEditor.getState();
      const next = time + (now - last) / 1000;
      last = now;
      if (next >= project.duration) { seek(project.duration); setPlaying(false); return; }
      seek(next);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      const s = useEditor.getState();
      if (e.key === " ") { e.preventDefault(); s.setPlaying(!s.playing); }
      else if (e.metaKey && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if (e.metaKey && e.key === "1") { e.preventDefault(); s.setMode("lite"); }
      else if (e.metaKey && e.key === "2") { e.preventDefault(); s.setMode("studio"); }
      else if (e.metaKey && e.key === "[") { e.preventDefault(); if (s.mode === "studio") s.togglePanel("left"); }
      else if (e.metaKey && e.key === "]") { e.preventDefault(); s.togglePanel("right"); }
      else if (e.key === "v") s.setTool("pointer");
      else if (e.key === "p") s.setTool("pen");
      else if (e.key === "m") s.setTool("region");
      else if (e.key === "ArrowLeft") s.seek(s.time - (e.shiftKey ? 1 : 1 / 60));
      else if (e.key === "ArrowRight") s.seek(s.time + (e.shiftKey ? 1 : 1 / 60));
      else if ((e.key === "Backspace" || e.key === "Delete") && s.selection) s.removeItem(s.selection);
      else if (e.key === "Escape") { s.select(null); s.setDraft(null); s.setTool("pointer"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/* ───────────────────────── Top bar ───────────────────────── */

const MODES: { value: EditorMode; label: string }[] = [{ value: "lite", label: "Lite" }, { value: "studio", label: "Studio" }];

function TopBar() {
  const project = useEditor((s) => s.project);
  const mode = useEditor((s) => s.mode);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const panels = useEditor((s) => s.panels);
  // Finishing waits for the work: the election handles open notes and decisions; a run in progress holds it here.
  const working = useAgent((s) => s.running || s.queue.length > 0);
  const { undo, redo, setMode, togglePanel } = useEditor.getState();
  return (
    <header className={styles.top} data-tauri-drag-region>
      <div className={styles.crumbs} data-tauri-drag-region>
        {mode === "studio" && (
          <IconKey label={panels.left ? "Hide sidebar" : "Show sidebar"} shortcut="⌘[" size="sm" onClick={() => togglePanel("left")}>
            {panels.left ? <PanelLeftClose /> : <PanelLeftOpen />}
          </IconKey>
        )}
        <Mark size={18} title="Spontaneous" />
        <span data-tauri-drag-region>{project.folder}</span>
        <span className={styles.crumbSep}>/</span>
        <button type="button" className={styles.project}>{project.name}<ChevronDown size={13} /></button>
      </div>
      <div className={styles.center}>
        <Switcher label="Editor mode" options={MODES} value={mode} onChange={setMode} />
      </div>
      <div className={styles.right}>
        <IconKey label="Undo" shortcut="⌘Z" size="sm" disabled={!canUndo} onClick={undo}><Undo2 /></IconKey>
        <IconKey label="Redo" shortcut="⇧⌘Z" size="sm" disabled={!canRedo} onClick={redo}><Redo2 /></IconKey>
        <IconKey label="Share" size="sm"><Share /></IconKey>
        <CtaRegion name="titlebar">
          <CtaKey intent="finish" size="sm" label={exportLabel()} role={working ? "secondary" : undefined} style={{ marginLeft: 6, height: 26, padding: "0 12px" }} />
        </CtaRegion>
        <span className={styles.topDivider} aria-hidden />
        <IconKey label={panels.right ? "Hide agent and notes" : "Show agent and notes"} shortcut="⌘]" size="sm" onClick={() => togglePanel("right")}>
          {panels.right ? <PanelRightClose /> : <PanelRightOpen />}
        </IconKey>
      </div>
    </header>
  );
}

/* ───────────────────────── Inspector (Studio) ───────────────────────── */

const INSPECTOR_TABS: { value: InspectorTab; label: string }[] = [
  { value: "template", label: "Shot" },
  { value: "style", label: "Style" },
  { value: "cursor", label: "Cursor" },
  { value: "motion", label: "Motion" },
];

function Inspector() {
  const tab = useEditor((s) => s.inspector);
  const setTab = useEditor((s) => s.setInspector);
  const open = useEditor((s) => s.panels.left);
  return (
    <Panel className={styles.inspector} inert={!open}>
      <div className={styles.inspectorTabs}>
        <Switcher label="Inspector" options={INSPECTOR_TABS} value={tab} onChange={setTab} full />
      </div>
      <div className={styles.inspectorBody}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {tab === "template" && <ShotTab />}
            {tab === "style" && <StyleTab />}
            {tab === "cursor" && <CursorTab />}
            {tab === "motion" && <MotionTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function ShotTab() {
  const project = useEditor((s) => s.project);
  const { chooseShot, setBackground, setMotion, edit } = useEditor.getState();
  const current = shotById(project.template);
  const [set, setSet] = useState<ShotSet>(current.set);
  return (
    <>
      <Group>
        <Switcher label="Shot set" full value={set} onChange={setSet} options={SHOT_SETS} />
        <div className={styles.templateGrid}>
          {SHOTS.filter((s) => s.set === set).map((shot) => (
            <ShotCard key={shot.id} shot={shot} selected={project.template === shot.id} onSelect={() => chooseShot(shot.id)} />
          ))}
        </div>
      </Group>
      <Group title={`${current.name} motion`}>
        <div className={styles.primitives}>
          {current.motion.map((m, i) => (
            <span key={i} className={styles.primitive} title={PRIMITIVES[m.kind].describe}>
              <b>{PRIMITIVES[m.kind].label}</b>
              {m.kind !== "hold" && <span>{fmt(m.from)}→{fmt(m.to)}{PRIMITIVES[m.kind].unit}</span>}
              <span className="mono">{m.at.toFixed(1)}s +{m.duration.toFixed(1)}s</span>
            </span>
          ))}
        </div>
        <div className={styles.stack}>
          <Slider label="Speed" value={project.motion.speed} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} showValue onValueChange={(v) => setMotion({ speed: v })} />
          <Slider label="Amount" value={project.motion.amount} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} showValue onValueChange={(v) => setMotion({ amount: v })} />
        </div>
        <Hint>Or tell the agent: “slower orbit”, “more dramatic”, “keep it still”.</Hint>
      </Group>
      <Group title="Aspect">
        <Switcher label="Aspect ratio" full value={project.aspect} onChange={(v: Aspect) => edit("Aspect", (p) => ({ ...p, aspect: v }))}
          options={(["16:9", "1:1", "4:5"] as Aspect[]).map((a) => ({ value: a, label: a }))} />
      </Group>
      <BackdropGroup value={project.background} onChange={setBackground} />
    </>
  );
}

const fmt = (v: number) => (Math.abs(v) < 10 && v % 1 ? v.toFixed(2) : String(Math.round(v)));

const BACKDROP_SETS: { value: BackdropSet; label: string }[] = [
  { value: "natural", label: "Natural" },
  { value: "gradient", label: "Gradient" },
  { value: "neutral", label: "Neutral" },
];

/** Backdrops by set: the two image sets in a scrolling grid, the neutrals as swatches. */
function BackdropGroup({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [set, setSet] = useState<BackdropSet>(backdrop(value).set);
  const options = Object.entries(BACKGROUNDS).filter(([, b]) => b.set === set).map(([id, b]) => ({ id, label: b.label, css: b.thumb }));
  return (
    <Group title="Backdrop">
      <Switcher label="Backdrop set" full value={set} onChange={setSet} options={BACKDROP_SETS} />
      <SwatchPicker options={options} value={value} onChange={onChange} wide={set !== "neutral"} />
    </Group>
  );
}

function StyleTab() {
  const frame = useEditor((s) => s.project.frame);
  const edit = useEditor((s) => s.edit);
  const set = (key: keyof Project["frame"]) => (v: number) => edit(`Frame ${key}`, (p) => ({ ...p, frame: { ...p.frame, [key]: v } }));
  return (
    <Group title="Frame">
      <div className={styles.stack}>
        <Slider label="Padding" value={frame.padding} min={0} max={20} step={1} format={(v) => `${v}%`} showValue onValueChange={set("padding")} />
        <Slider label="Corner radius" value={frame.radius} min={0} max={32} step={1} format={(v) => `${v}px`} showValue onValueChange={set("radius")} />
        <Slider label="Shadow" value={frame.shadow} min={0} max={100} step={1} showValue onValueChange={set("shadow")} />
      </div>
    </Group>
  );
}

function CursorTab() {
  const cursor = useEditor((s) => s.project.cursor);
  const edit = useEditor((s) => s.edit);
  const set = <K extends keyof Project["cursor"]>(key: K, v: Project["cursor"][K]) => edit(`Cursor ${key}`, (p) => ({ ...p, cursor: { ...p.cursor, [key]: v } }));
  return (
    <>
      <Group title="Cursor">
        <div className={styles.stack}>
          <Slider label="Size" value={cursor.size} min={0.6} max={3} step={0.1} format={(v) => `${v.toFixed(1)}×`} showValue onValueChange={(v) => set("size", v)} />
          <Slider label="Smoothing" value={cursor.smoothing} min={0} max={100} step={1} showValue onValueChange={(v) => set("smoothing", v)} />
        </div>
      </Group>
      <Group title="Behavior">
        <Field label="Hide idle"><Switch checked={cursor.hideWhenIdle} onCheckedChange={(v) => set("hideWhenIdle", v)} aria-label="Hide cursor when idle" /></Field>
        <Field label="Click ripple"><Switch checked={cursor.clickRipple} onCheckedChange={(v) => set("clickRipple", v)} aria-label="Show click ripple" /></Field>
        <Hint>The cursor is recorded as data, so these apply to footage you already have.</Hint>
      </Group>
    </>
  );
}

function MotionTab() {
  const springs = useEditor((s) => s.project.springs);
  const blur = useEditor((s) => s.project.motionBlur);
  const edit = useEditor((s) => s.edit);
  const setSpring = (key: "stiffness" | "damping" | "mass") => (v: number) => edit("Spring", (p) => ({ ...p, springs: { ...p.springs, screen: { ...p.springs.screen, [key]: v } } }));
  return (
    <>
      <Group title="Camera spring">
        <div className={styles.stack}>
          <ScrubInput label="Stiffness" value={springs.screen.stiffness} min={20} max={800} step={10} onValueChange={setSpring("stiffness")} />
          <ScrubInput label="Damping" value={springs.screen.damping} min={1} max={120} step={1} onValueChange={setSpring("damping")} />
          <ScrubInput label="Mass" value={springs.screen.mass} min={0.5} max={10} step={0.25} precision={2} onValueChange={setSpring("mass")} />
        </div>
      </Group>
      <Group title="Motion blur">
        <Slider label="Amount" value={blur} min={0} max={100} step={1} showValue onValueChange={(v) => edit("Blur", (p) => ({ ...p, motionBlur: v }))} />
      </Group>
      <Group title="Auto zoom">
        <Hint>Zooms come from clicks and typing. Regenerating keeps your edits and the agent's.</Hint>
        <Key size="md" style={{ width: "100%" }}><RotateCcw />Regenerate</Key>
      </Group>
    </>
  );
}

/* ───────────────────────── Stage ───────────────────────── */

/** With a clip, the stage shows it under the shot. Without one, or with Preview on, the shot plays on its own. */
function Stage() {
  const hasClip = useEditor((s) => !!s.project.recording);
  const preview = useEditor((s) => s.preview);
  return hasClip && !preview ? <ClipStage /> : <ShotPreview />;
}

/** Stage chips: the shot, and on a clip, the switch to preview the shot on its own. */
function StageTop({ shot, aspect, children }: { shot: Shot; aspect: Aspect; children?: ReactNode }) {
  const hasClip = useEditor((s) => !!s.project.recording);
  const preview = useEditor((s) => s.preview);
  return (
    <div className={stageStyles.stageTop}>
      <span className={stageStyles.chips}>
        <span className={stageStyles.chip}>{shot.name} · {aspect}</span>
        {children}
      </span>
      {hasClip && !preview && (
        <button type="button" className={stageStyles.chip} onClick={() => useEditor.getState().setPreview(true)}>
          <Clapperboard size={12} />Preview shot
        </button>
      )}
    </div>
  );
}

function ClipStage() {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const tool = useEditor((s) => s.tool);
  const draft = useEditor((s) => s.draft);
  const { setTool, setDraft, addNote, select, setSide } = useEditor.getState();
  const zoom = activeZoom(project, time);
  const recording = project.recording!;
  const recorded = cursorAtTime(recording.cursor, time);
  const cursor = { x: recorded?.x ?? -1, y: recorded?.y ?? -1, clicking: recording.clicks.some((c) => time >= c.t && time < c.t + 0.5) };
  const overlays = project.overlays.filter((o) => time >= o.start && time <= o.end);
  const shot = shotById(project.template);
  const flat = shot.device === "browser" || shot.device === "window";
  const device: DeviceKind = shot.device === "window" ? "window" : "browser";
  const nearby = project.notes.filter((n) => Math.abs(n.at - time) < 2.5);
  const pins = pinNumbers(project.notes);
  const openPin = (id: string) => { select(id); setSide("notes"); };
  const camera = { scale: zoom?.scale ?? 1, target: zoom?.target ?? { x: 0.5, y: 0.5 } };
  // What belongs to the footage, in recording space: the video, cursor and overlays.
  const footage = (
    <>
      <VideoScreen src={recording.videoSrc} time={time} playing={playing} />
      {cursor.x >= 0 && <Cursor x={cursor.x} y={cursor.y} size={project.cursor.size} clicking={project.cursor.clickRipple && cursor.clicking} />}
      <AnimatePresence>
        {overlays.filter((o) => o.kind === "callout").map((o) => <Callout key={o.id} x={0.56} y={0.24}>{o.label}</Callout>)}
      </AnimatePresence>
    </>
  );
  // Notes from before canvas-space notes stay on the recording, on the main screen only.
  const screenContent = (
    <>
      {footage}
      <AnnotationLayer notes={nearby.filter((n) => n.space !== "canvas")} tool="pointer" numbers={pins} onPinClick={openPin} />
    </>
  );

  return (
    <div className={styles.stage}>
      <CanvasViewport
        aspect={project.aspect}
        background={backdrop(project.background).css}
        overlay={
          <>
            <StageTop shot={shot} aspect={project.aspect}>
              <AnimatePresence>
                {zoom && (
                  <motion.span key={zoom.id} className={stageStyles.chip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {zoom.author === "agent" ? <Mark size={12} title="" /> : <Cell variant={zoom.author === "auto" ? "hollow" : "solid"} size={6} />}
                    Zoom {zoom.scale}×
                  </motion.span>
                )}
              </AnimatePresence>
            </StageTop>
            <AnnotationDock
              tool={tool}
              onToolChange={setTool}
              timeLabel={formatTime(time)}
              hasDraft={!!draft}
              onSubmit={(text, voice) => {
                const onRecording = draft?.screen;
                const id = addNote({ at: time, text, intents: onRecording ? ["zoom"] : [], space: "canvas", region: draft?.region, ink: draft?.ink, screen: onRecording, voice });
                setDraft(null);
                setTool("pointer");
                select(id);
                setSide("notes");
              }}
            />
          </>
        }
      >
        {flat ? (
          <Camera {...camera}>
            <DeviceFrame kind={device} padding={project.frame.padding} radius={project.frame.radius} shadow={project.frame.shadow} contentAspect={recording.width / recording.height}>
              <RecordingScreen main>{screenContent}</RecordingScreen>
            </DeviceFrame>
          </Camera>
        ) : (
          // Shots move the camera around a device; zooms still happen inside its screen.
          <ShotScene
            shot={shot}
            background={project.background}
            pose={poseAt(shot, time - project.span.start, project.motion)}
            screen={<RecordingScreen main camera={camera}>{screenContent}</RecordingScreen>}
            // The other screens in Tile Stack and Infinite Wall: the same footage, so marks on them land on the recording too.
            extraScreens={[0, 1].map((i) => <RecordingScreen key={i} camera={camera}>{footage}</RecordingScreen>)}
          />
        )}
        {/* Your marks, over the whole canvas: on the recording or the backdrop around it. */}
        <AnnotationLayer
          notes={nearby.filter((n) => n.space === "canvas")}
          tool={tool}
          draft={draft}
          onDraft={setDraft}
          numbers={pins}
          onPinClick={openPin}
          locate={locateOnRecording}
        />
      </CanvasViewport>
    </div>
  );
}

const fill = { position: "absolute", inset: 0 } as const;

/**
 * One screen showing the recording, with corner markers so a mark on the
 * canvas can be mapped onto the footage. With `camera` (the 3D shots) zooms
 * happen inside the screen, which then crops them; flat shots zoom the whole
 * canvas around it instead.
 */
function RecordingScreen({ main, camera, children }: { main?: boolean; camera?: { scale: number; target: { x: number; y: number } }; children: ReactNode }) {
  if (!camera) return <div data-screen={main ? "main" : ""} style={fill}>{children}<ScreenCorners of="recording" /></div>;
  return (
    <div data-screen={main ? "main" : ""} style={fill}>
      <ScreenCorners of="window" />
      <Camera {...camera}><div style={fill}>{children}<ScreenCorners of="recording" /></div></Camera>
    </div>
  );
}

/**
 * Where a region drawn on the canvas lands on the recording: through the
 * screen under the region's center (the front one, in shots with several),
 * else the main screen. Undefined when it's only on the backdrop.
 */
function locateOnRecording(region: Rect, layer: HTMLElement): Rect | undefined {
  const c = layer.getBoundingClientRect();
  const under = document.elementsFromPoint(c.left + (region.x + region.w / 2) * c.width, c.top + (region.y + region.h / 2) * c.height)
    .map((el) => el.closest("[data-screen]")).find((el) => el && layer.parentElement?.contains(el));
  const screen = under ?? layer.parentElement?.querySelector("[data-screen=main]");
  const recording = measureQuad(screen?.querySelector("[data-of=recording]") ?? null, layer);
  if (!recording) return undefined;
  return canvasToRecording({ recording, window: measureQuad(screen!.querySelector(":scope > [data-of=window]"), layer) }, region);
}

/** The preview's own clock: plays from the start whenever the shot changes, and loops over the span. */
function usePreviewClock(length: number, shotId: string) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => { setT(0); setPlaying(true); }, [shotId]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => (prev + dt >= length ? 0 : prev + dt));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, length]);
  return { t: Math.min(t, length), seek: setT, playing, setPlaying };
}

/**
 * The shot on its own: the stand-in screen, no cursor, no notes, and a small
 * timeline for the template's span under the artboard.
 */
function ShotPreview() {
  const project = useEditor((s) => s.project);
  const hasClip = !!project.recording;
  const setSpan = useEditor((s) => s.setSpan);
  const shot = shotById(project.template);
  const { speed } = project.motion;
  // The span can't end before the move does.
  const minLength = Math.ceil((shotLength(shot) / speed) * 10) / 10;
  const length = Math.max(project.span.length, minLength);
  const { t, seek, playing, setPlaying } = usePreviewClock(length, shot.id);
  const flat = shot.device === "browser" || shot.device === "window";
  // Zoom focus has no camera move of its own; show the push it makes on a click.
  const focusZoom = shot.id === "focus" && t > 0.6 && t < length - 0.6;

  return (
    <div className={styles.stage}>
      <CanvasViewport
        aspect={project.aspect}
        background={backdrop(project.background).css}
        overlay={
          <>
            <StageTop shot={shot} aspect={project.aspect} />
            <Dock aria-label="Shot preview" className={styles.previewBar}>
              <DockTool label={playing ? "Pause preview" : "Play preview"} onClick={() => setPlaying(!playing)}>
                {playing ? <Pause fill="currentColor" strokeWidth={0} /> : <Play fill="currentColor" strokeWidth={0} />}
              </DockTool>
              <Timecode value={t} frames fps={project.fps} className={styles.previewTime} />
              <SpanTrack shot={shot} speed={speed} length={length} time={t} onSeek={(v) => { seek(v); setPlaying(false); }} />
              <DockDivider />
              <ScrubInput label="Length" size="sm" unit="s" value={length} min={minLength} max={30} step={0.1} precision={1}
                className={styles.previewLength} onValueCommit={(v) => setSpan({ length: v })} />
              {hasClip && (
                <>
                  <DockDivider />
                  <CtaRegion name="stage">
                    <CtaKey intent="navigate" className={styles.backToClip} icon={<Film size={14} />} label="Back to clip" onClick={() => useEditor.getState().setPreview(false)} />
                  </CtaRegion>
                </>
              )}
            </Dock>
          </>
        }
      >
        {flat ? (
          <Camera scale={focusZoom ? 1.7 : 1} target={{ x: 0.42, y: 0.46 }}>
            <DeviceFrame kind={shot.device === "window" ? "window" : "browser"} padding={project.frame.padding} radius={project.frame.radius} shadow={project.frame.shadow}>
              <ScreenArt tone={standInTone(shot)} />
            </DeviceFrame>
          </Camera>
        ) : (
          <ShotScene
            shot={shot}
            background={project.background}
            pose={poseAt(shot, t, project.motion)}
            screen={<ScreenArt tone={standInTone(shot)} />}
            extraScreens={EXTRA_TONES.map((tone) => <ScreenArt key={tone} tone={tone} />)}
          />
        )}
      </CanvasViewport>
    </div>
  );
}

/** The span as a track: each move of the shot drawn where it happens, then the rest. */
function SpanTrack({ shot, speed, length, time, onSeek }: { shot: Shot; speed: number; length: number; time: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => `${(Math.min(v, length) / length) * 100}%`;
  const scrub = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onSeek(Math.min(length, Math.max(0, ((e.clientX - r.left) / r.width) * length)));
  };
  const moves = shot.motion.filter((m) => m.kind !== "hold");
  return (
    <div ref={ref} className={styles.spanTrack} role="slider" aria-label="Preview time" aria-valuemin={0} aria-valuemax={length} aria-valuenow={Math.round(time * 10) / 10} tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e); }}>
      <span className={styles.spanRail} />
      {moves.map((m, i) => (
        <span key={i} className={styles.spanMove} title={`${PRIMITIVES[m.kind].label} · ${PRIMITIVES[m.kind].describe}`}
          style={{ left: pct(m.at / speed), width: pct(m.duration / speed), top: moves.length > 1 ? `${30 + (i % 3) * 14}%` : undefined }} />
      ))}
      <span className={styles.spanHead} style={{ left: pct(time) }} />
    </div>
  );
}

/* ───────────────────────── Side panel ───────────────────────── */

function SidePanel() {
  const side = useEditor((s) => s.side);
  const setSide = useEditor((s) => s.setSide);
  const notes = useEditor((s) => s.project.notes);
  const running = useAgent((s) => s.running);
  const connection = useAgent((s) => s.connection);
  const billedElsewhere = useAgent((s) => s.billedElsewhere);
  const open = notes.filter((n) => n.status === "open").length;
  const shown = useEditor((s) => s.panels.right);
  // Which harness runs is shown in the composer; the header only speaks up when something's off.
  const label = running ? "Working"
    : billedElsewhere ? "Not using your plan"
    : connection.phase === "ready" ? null
    : connection.phase === "checking" ? "Checking" : "Not connected";
  return (
    <Panel className={styles.side} inert={!shown} header={
      <>
        <Switcher label="Side panel" value={side} onChange={setSide} options={[{ value: "agent", label: "Agent" }, { value: "notes", label: "Notes", count: open }, { value: "changes", label: "Changes" }]} />
        <span className={styles.status}>
          {label && <><Cell variant={running ? "solid" : "muted"} size={6} className={running ? styles.working : undefined} />{label}</>}
        </span>
        <AgentMenu />
      </>
    }>
      {side === "agent" ? <CtaRegion name="agent"><AgentPane /></CtaRegion>
        : side === "notes" ? <CtaRegion name="notes"><NotesPane /></CtaRegion>
        : <CtaRegion name="changes"><ChangesPane /></CtaRegion>}
    </Panel>
  );
}

function AgentPane() {
  const connection = useAgent((s) => s.connection);
  if (connection.phase !== "ready") {
    const { checkConnection, signIn } = useAgent.getState();
    return <AgentConnect phase={connection.phase} error={connection.phase === "signing-in" ? connection.error : undefined} onSignIn={signIn} onCheck={checkConnection} />;
  }
  return <AgentConversation />;
}

function AgentConversation() {
  const harness = useAgent((s) => s.harness);
  const { undo } = useAgent.getState();
  const actions = useAgentActions();
  const empty = harness === "codex" ? "Codex can't run here yet. Switch to Claude Code in the composer to talk through your notes."
    : "Talk through your notes with Claude Code. It can't change the timeline yet.";
  return (
    <AgentThread
      above={<AgentAbove />}
      composer={<AgentComposerBar />}
      actions={actions}
      onUndo={undo}
      empty={isTauri || harness === "codex" ? <AgentEmpty>{empty}</AgentEmpty> : undefined}
    />
  );
}

/** Offers a newer Claude Code once per launch, after the connection check finds the installed one. */
function AgentUpdate() {
  const version = useAgent((s) => s.cliVersion);
  const available = useAgentUpdate((s) => s.available);
  const state = useAgentUpdate((s) => s.state);
  const { check, install, dismiss } = useAgentUpdate.getState();
  useEffect(() => { if (version) void check(version); }, [version, check]);
  if (!available) return null;
  return <CliUpdateNotice installed={available.installed} latest={available.latest} state={state} onUpdate={install} onDismiss={dismiss} />;
}

function NotesPane() {
  const notes = useEditor((s) => s.project.notes);
  const selection = useEditor((s) => s.selection);
  const { seek, select, setNoteStatus, setSide } = useEditor.getState();
  const { applyNotes, unqueueNote } = useAgent.getState();
  const sorted = [...notes].filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);
  const open = sorted.filter((n) => n.status === "open");
  const working = sorted.filter((n) => n.status === "queued" || n.status === "applying");
  const applied = sorted.filter((n) => n.status === "applied");
  return (
    <>
      <div className={styles.notes}>
        {sorted.length ? sorted.map((n, i) => (
          <NoteCard key={n.id} note={n} index={i + 1} selected={selection === n.id} onSelect={() => select(n.id)} onSeek={seek}
            onDismiss={() => setNoteStatus(n.id, "dismissed")}
            onUnqueue={() => unqueueNote(n.id)}
            onApply={() => applyNotes([n.id])} />
        )) : <p className={styles.emptyNotes}>Draw on the frame or type in the bar below the video to leave a note.</p>}
      </div>
      {!!sorted.length && (
        <div className={styles.notesBar}>
          <span className={styles.notesCount}>
            {open.length} open{working.length ? ` · ${working.length} in progress` : ""} · {applied.length} applied
          </span>
          {working.length > 0 && <Key size="sm" variant="tertiary" onClick={() => setSide("agent")}>Watch</Key>}
          <CtaKey size="sm" intent="run" count={open.length} label={isTauri ? (open.length === 1 ? "Plan open note" : `Plan ${open.length} open notes`) : notesLabel(open)} disabled={!open.length} reason="No open notes" onClick={() => applyNotes()} />
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Lite: scrub bar ───────────────────────── */

function ScrubBar() {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const { seek, setPlaying, select } = useEditor.getState();
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${(t / project.duration) * 100}%`;
  const scrub = (e: ReactPointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * project.duration);
  };
  return (
    <div className={styles.scrub}>
      {/* Transport, not a call to action: key material, so it never competes with the surface's primary. */}
      <Key variant="secondary" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} style={{ width: 30, height: 30, padding: 0, borderRadius: "50%" }}>
        {playing ? <Pause size={13} fill="currentColor" strokeWidth={0} /> : <Play size={13} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
      </Key>
      <Timecode value={time} />
      <div ref={trackRef} className={styles.scrubTrack} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={project.duration} aria-valuenow={Math.round(time)} tabIndex={0}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e); }}>
        <span className={styles.scrubRail} />
        {project.zooms.map((z) => <span key={z.id} className={styles.scrubZoom} style={{ left: pct(z.start), width: pct(z.end - z.start) }} />)}
        <span className={styles.scrubFill} style={{ width: pct(time) }} />
        {project.notes.filter((n) => n.status === "open").map((n) => (
          <span key={n.id} className={styles.scrubPin} style={{ left: pct(n.at) }} onPointerDown={(e) => { e.stopPropagation(); seek(n.at); select(n.id); }}>
            <Cell variant="ink" size={9} />
          </span>
        ))}
        <span className={styles.scrubHead} style={{ left: pct(time) }} />
      </div>
      <Timecode value={project.duration} muted />
    </div>
  );
}

/* ───────────────────────── Studio: timeline ───────────────────────── */

function TimelinePanel() {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const zoom = useEditor((s) => s.zoomLevel);
  const selection = useEditor((s) => s.selection);
  const { seek, setPlaying, select, setZoomLevel, addZoom } = useEditor.getState();
  // The scale follows the timeline's width, so opening or closing a sidebar refits it.
  const fitRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(fitRef);
  const pps = fitPps(width, project.duration) * zoom;
  const notes = [...project.notes].filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);

  return (
    <section className={styles.timelineArea} aria-label="Timeline">
      <Transport time={time} duration={project.duration} playing={playing} fps={project.fps} onPlayPause={() => setPlaying(!playing)}
        start={
          <>
            <IconKey label="Split at playhead" shortcut="S" size="sm" tooltip="top"><Scissors /></IconKey>
            <IconKey label="Add zoom at playhead" shortcut="Z" size="sm" tooltip="top"
              onClick={() => select(addZoom({ start: time, end: Math.min(project.duration, time + 4), scale: 1.5, target: { x: 0.5, y: 0.5 }, author: "user" }))}>
              <ZoomIn />
            </IconKey>
          </>
        }
        end={
          <label className={styles.zoomRange}>
            <ZoomOut size={14} />
            <input type="range" min={1} max={12} step={0.1} value={zoom} onChange={(e) => setZoomLevel(+e.target.value)} aria-label="Timeline zoom" />
            <ZoomIn size={14} />
          </label>
        }
      />
      <div ref={fitRef} className={styles.timelineFit}>
      <Timeline duration={project.duration} pps={pps} time={time} onSeek={seek}>
        <Track label="Screen">
          {project.clips.map((c) => <ClipItem key={c.id} start={c.start} end={c.end} pps={pps} label={c.speed !== 1 ? `${c.label} · ${c.speed}×` : c.label} selected={selection === c.id} onSelect={() => select(c.id)} />)}
        </Track>
        <Track label="Zoom">
          {project.zooms.map((z) => <TrackItem key={z.id} kind="zoom" start={z.start} end={z.end} pps={pps} label={`${z.scale}×`} author={z.author} selected={selection === z.id} onSelect={() => { select(z.id); seek(z.start); }} />)}
        </Track>
        <Track label="Overlays">
          {project.overlays.map((o) => <TrackItem key={o.id} kind="overlay" start={o.start} end={o.end} pps={pps} label={o.label} meta={o.kind} author={o.author} selected={selection === o.id} onSelect={() => select(o.id)} />)}
        </Track>
        <Track label="Notes">
          {notes.map((n, i) => <NoteMarker key={n.id} at={n.at} pps={pps} index={i + 1} status={n.status} label={n.text} selected={selection === n.id} onSelect={() => { select(n.id); seek(n.at); }} />)}
        </Track>
        <Track label="Audio"><Waveform duration={project.duration} pps={pps} /></Track>
      </Timeline>
      </div>
    </section>
  );
}
