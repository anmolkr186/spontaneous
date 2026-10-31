import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { ArrowUp, AppWindow, Crop, GripVertical, Mic, MicOff, Monitor, MousePointer2, PenLine, Scan, Square, Trash2, Volume2, VolumeOff, X } from "lucide-react";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import { Cell, Meter } from "@/ui/atoms";
import { SourceKey, ToggleKey } from "@/ui/molecules";
import { formatTime } from "@/editor/model";
import styles from "./dock.module.css";

/* ───────────────────────── Dock surface ───────────────────────── */

/** The floating slab that holds keys and wells. */
export function Dock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="toolbar" className={[styles.dock, className].filter(Boolean).join(" ")} {...props} />;
}

/** Grip at the dock's leading edge. In a desktop window it moves the window. */
export function DockHandle() {
  return <span className={styles.handle} data-tauri-drag-region title="Drag to move" aria-hidden><GripVertical /></span>;
}

export function DockDivider() {
  return <span className={styles.divider} aria-hidden />;
}

/** A square key inside a dock. */
export function DockTool({ label, shortcut, pressed, live, onClick, children }: { label: string; shortcut?: string; pressed?: boolean; live?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="top">
      <button type="button" className={styles.tool} aria-label={label} aria-pressed={pressed} data-live={live || undefined} onClick={onClick}>{children}</button>
    </Tooltip>
  );
}

/* ───────────────────────── Annotation dock ───────────────────────── */

export type AnnotationTool = "pointer" | "pen" | "region";

export interface AnnotationDockProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  timeLabel: string;
  hasDraft?: boolean;
  onSubmit: (text: string, voice?: { seconds: number }) => void;
  className?: string;
}

/** The note bar on the stage: mark the frame, speak or type, send to the agent. */
export function AnnotationDock({ tool, onToolChange, timeLabel, hasDraft, onSubmit, className }: AnnotationDockProps) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (hasDraft) inputRef.current?.focus(); }, [hasDraft]);

  const submit = () => {
    const voice = recording !== null ? { seconds: Math.max(1, Math.round((performance.now() - recording) / 1000)) } : undefined;
    if (!text.trim() && !voice && !hasDraft) return;
    onSubmit(text.trim() || (voice ? "Voice note" : "Marked area"), voice);
    setText("");
    setRecording(null);
  };

  return (
    <Dock aria-label="Annotate" className={[styles.annotation, className].filter(Boolean).join(" ")}>
      <DockTool label={recording !== null ? "Stop voice note" : "Voice note"} pressed={recording !== null} live={recording !== null} onClick={() => setRecording(recording === null ? performance.now() : null)}>
        {recording !== null ? <Square /> : <Mic />}
      </DockTool>
      <DockTool label="Select" shortcut="V" pressed={tool === "pointer"} onClick={() => onToolChange("pointer")}><MousePointer2 /></DockTool>
      <DockTool label="Draw on frame" shortcut="P" pressed={tool === "pen"} onClick={() => onToolChange("pen")}><PenLine /></DockTool>
      <DockTool label="Mark an area" shortcut="M" pressed={tool === "region"} onClick={() => onToolChange("region")}><Scan /></DockTool>
      <DockDivider />
      {recording !== null && <span className={styles.live}><Meter bars={14} /></span>}
      <input
        ref={inputRef}
        className={styles.well}
        value={text}
        placeholder={hasDraft ? "Describe the change here…" : "Leave a note…"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") inputRef.current?.blur(); }}
        aria-label="Note"
      />
      <span className={styles.time}>{timeLabel}</span>
      <button type="button" className={styles.send} aria-label="Send note" disabled={!text.trim() && recording === null && !hasDraft} onClick={submit}>
        <ArrowUp />
      </button>
    </Dock>
  );
}

/* ───────────────────────── Recorder dock ───────────────────────── */

export type RecordSource = "display" | "window" | "area";
export type RecorderPhase = "setup" | "starting" | "recording" | "stopping";

export interface RecorderDockProps {
  phase: RecorderPhase;
  source: RecordSource;
  onSource: (source: RecordSource) => void;
  microphone: boolean;
  onMicrophone: (on: boolean) => void;
  systemAudio: boolean;
  onSystemAudio: (on: boolean) => void;
  /** Disables Record and explains why (e.g. no window chosen). */
  blocked?: string | null;
  elapsed: number;
  onRecord: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onClose: () => void;
  /** Rendered above the dock: a permission notice or an error. */
  above?: ReactNode;
  /** What each source currently points at, shown in its key once chosen ("Safari", "1280 × 720"). */
  labels?: Partial<Record<RecordSource, string>>;
  /** Drop a chosen window or area and go back to recording the display. */
  onClearSource?: (source: RecordSource) => void;
}

/**
 * The recorder: choose a source and audio, record, stop. One slab that changes
 * contents between setup and recording, so it never jumps position. Drag it by
 * the grip or by any empty part of the slab.
 */
export function RecorderDock(p: RecorderDockProps) {
  const live = p.phase === "recording" || p.phase === "stopping";
  return (
    <div className={styles.recorder}>
      {p.above}
      <Dock aria-label="Recorder" data-tauri-drag-region>
        <DockHandle />
        {!live ? (
          <>
            <DockTool label="Close" onClick={p.onClose}><X /></DockTool>
            <DockDivider />
            <div role="radiogroup" aria-label="Record" style={{ display: "flex", gap: 2 }} data-tauri-drag-region>
              <SourceKey icon={<Monitor />} label={(p.source === "display" && p.labels?.display) || "Display"} selected={p.source === "display"} onSelect={() => p.onSource("display")} />
              <SourceKey icon={<AppWindow />} label={(p.source === "window" && p.labels?.window) || "Window"} selected={p.source === "window"} onSelect={() => p.onSource("window")} onClear={p.labels?.window && p.onClearSource ? () => p.onClearSource!("window") : undefined} />
              <SourceKey icon={<Crop />} label={(p.source === "area" && p.labels?.area) || "Area"} selected={p.source === "area"} onSelect={() => p.onSource("area")} onClear={p.labels?.area && p.onClearSource ? () => p.onClearSource!("area") : undefined} />
            </div>
            <DockDivider />
            <ToggleKey on={p.microphone} onChange={p.onMicrophone} iconOn={<Mic />} iconOff={<MicOff />} labelOn="Microphone" labelOff="No microphone" />
            <ToggleKey on={p.systemAudio} onChange={p.onSystemAudio} iconOn={<Volume2 />} iconOff={<VolumeOff />} labelOn="System audio" labelOff="No system audio" />
            <DockDivider />
            <Tooltip content={p.blocked ? "Can't record yet" : "Start recording"} description={p.blocked ?? undefined} side="top">
              <button type="button" className={styles.recordKey} disabled={!!p.blocked || p.phase === "starting"} onClick={p.onRecord}>
                <span className={styles.recDot} />{p.phase === "starting" ? "Starting…" : "Record"}
              </button>
            </Tooltip>
          </>
        ) : (
          <>
            <span className={styles.clock} data-tauri-drag-region><Cell variant="rec" size={8} className={styles.blink} />{formatTime(p.elapsed)}</span>
            {p.microphone && <span className={styles.live}><Meter bars={12} /></span>}
            <DockDivider />
            <DockTool label="Discard recording" onClick={p.onDiscard}><Trash2 /></DockTool>
            <button type="button" className={styles.recordKey} onClick={p.onStop} disabled={p.phase === "stopping"}>
              <span className={styles.recSquare} />{p.phase === "stopping" ? "Saving…" : "Stop"}
            </button>
          </>
        )}
      </Dock>
    </div>
  );
}

/** A list sheet above the dock, used for choosing a window. */
export function DockSheet({ children }: { children: ReactNode }) {
  return <div className={styles.sheet}>{children}</div>;
}

export function DockRow({ title, detail, selected, onSelect }: { title: string; detail?: string; selected?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={styles.row} onClick={onSelect}>
      <b>{title}</b>{detail && <span>{detail}</span>}
    </button>
  );
}

export function DockNotice({ children }: { children: ReactNode }) {
  return <div className={styles.sheet}><div className={styles.notice}>{children}</div></div>;
}

export { styles as dockStyles };
