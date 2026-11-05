/**
 * Dropzone: brings recordings, b-roll and audio into the project. It reads top
 * to bottom: a well to drop files on (or click, to choose them), then one row
 * per file with what it is, how big, how far along and how long is left.
 *
 * Dragging files over the well fans its three film frames out, the outline
 * turns solid and the title counts the files. Rows grow in one after another;
 * a finished row draws its check, a failed one gives a short shake and offers
 * Retry. Removed rows fold away.
 *
 * Imports go through `onUpload`; without it they are simulated, and `autoplay`
 * plays a sample drop of four files for previews.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { MotionConfig, motion } from "motion/react";
import { RotateCcw, Upload, X } from "lucide-react";
import { DrawCheck, Fold, IconKey, Key, RollNumber, RollText, Swap, Tag, formatDuration } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./dropzone.module.css";

export type ImportKind = "video" | "audio" | "image" | "file";
export type ImportStatus = "importing" | "done" | "failed";

export interface ImportItem {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  kind: ImportKind;
  status: ImportStatus;
  /** 0 to 1. */
  progress: number;
  /** Why it failed, in a few words. */
  error?: string;
  /** False when trying again can't help (wrong type, too large). */
  retryable?: boolean;
  /** The dropped file. Sample rows have none. */
  file?: File;
}

export interface DropzoneProps {
  /** Extensions it takes. Other files get a row that says so. */
  accept?: string[];
  /** Largest file in bytes. Bigger files get a "Larger than …" row. Default 2 GB. */
  maxSize?: number;
  /** Imports one file and reports progress from 0 to 1. Reject to fail it: the message shows and Retry calls it again. Simulated when left out. */
  onUpload?: (file: File, onProgress: (progress: number) => void) => Promise<void>;
  /** Every change to the list. */
  onChange?: (items: ImportItem[]) => void;
  /** The line under the title. Defaults to the accepted types and the size limit. */
  hint?: string;
  /** Plays a sample drop of four files, for previews. */
  autoplay?: boolean;
  className?: string;
}

const ACCEPT = [".mov", ".mp4", ".m4a", ".wav", ".png"];
const GB = 1000 ** 3;
const KIND: Record<string, ImportKind> = { mov: "video", mp4: "video", m4v: "video", webm: "video", m4a: "audio", wav: "audio", mp3: "audio", aac: "audio", png: "image", jpg: "image", jpeg: "image", heic: "image" };
const KIND_LABEL: Record<ImportKind, string> = { video: "Video", audio: "Audio", image: "Image", file: "File" };
const FOLD_MS = 380;

/** A sample drop for previews: one of them fails once, so Retry has something to do. */
const SAMPLE: (Pick<ImportItem, "name" | "size"> & { failOnce?: boolean })[] = [
  { name: "Onboarding take 3.mov", size: 412_300_000 },
  { name: "Voiceover, final.m4a", size: 18_600_000 },
  { name: "Dashboard b-roll.mp4", size: 96_400_000, failOnce: true },
  { name: "Title card.png", size: 2_100_000 },
];

const ext = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
const kindOf = (name: string): ImportKind => KIND[ext(name)] ?? "file";

/** "412 MB", "18.6 MB", "2 GB": decimal units, like Finder. */
export function formatBytes(bytes: number) {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  const n = u === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "");
  return `${n} ${units[u]}`;
}

/** "12s", "1m 05s". Whole seconds: tenths would flicker while a file imports. */
const left = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.ceil(ms / 1000))}s` : formatDuration(ms));

/* The three film frames rest stacked and fan out while files hover. */
const REST = [{ x: -5, y: 2, rotate: -7 }, { x: 0, y: 0, rotate: 0 }, { x: 5, y: 2, rotate: 7 }];
const HOT = [{ x: -12, y: 0, rotate: -11 }, { x: 0, y: -3, rotate: 0 }, { x: 12, y: 0, rotate: 11 }];
const FAN = [{ x: -26, y: -3, rotate: -17 }, { x: 0, y: -9, rotate: 0 }, { x: 26, y: -3, rotate: 17 }];

function FilmFrame() {
  return (
    <svg viewBox="0 0 34 26" width="34" height="26" className={styles.film}>
      <rect className={styles.filmBody} x=".5" y=".5" width="33" height="25" rx="4" />
      {[5, 12, 19, 26].map((x) => <rect key={`t${x}`} className={styles.filmHole} x={x} y="2.5" width="3" height="2.5" rx=".6" />)}
      {[5, 12, 19, 26].map((x) => <rect key={`b${x}`} className={styles.filmHole} x={x} y="21" width="3" height="2.5" rx=".6" />)}
      <rect className={styles.filmPicture} x="4" y="7" width="26" height="12" rx="1.5" />
    </svg>
  );
}

type Item = ImportItem & { began: number; attempt: number; delay: number; leaving?: boolean; failOnce?: boolean };

export function Dropzone({ accept = ACCEPT, maxSize = 2 * GB, onUpload, onChange, hint, autoplay, className }: DropzoneProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(0);
  const [hot, setHot] = useState(false);
  const [said, setSaid] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());
  const alive = useRef(true);
  const removed = useRef(new Set<string>());

  useEffect(() => {
    alive.current = true;
    const t = timers.current;
    return () => { alive.current = false; t.forEach(clearTimeout); t.forEach(clearInterval); t.clear(); };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  };

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(items.filter((i) => !i.leaving).map(({ id, name, size, kind, status, progress, error, retryable, file }) => ({ id, name, size, kind, status, progress, error, retryable, file })));
  }, [items]);

  const patch = (id: string, p: Partial<Item>) => { if (alive.current) setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i))); };

  /** Imports without a backend: progress at a believable rate, with a little unevenness. */
  const simulate = (item: Item, report: (p: number) => void) => new Promise<void>((resolve, reject) => {
    const total = Math.min(Math.max((item.size / 150_000_000) * 1000, 1600), 5200);
    const failAt = item.failOnce && item.attempt === 1 ? 0.58 : 2;
    const start = performance.now();
    const id = window.setInterval(() => {
      const t = Math.min((performance.now() - start) / total, 1);
      const p = Math.min(1, t * (0.92 + Math.random() * 0.16));
      if (p >= failAt) { clearInterval(id); timers.current.delete(id); reject(new Error("Couldn't read the file")); return; }
      report(t >= 1 ? 1 : p);
      if (t >= 1) { clearInterval(id); timers.current.delete(id); resolve(); }
    }, 120);
    timers.current.add(id);
  });

  const run = (item: Item) => {
    const attempt = item.attempt + 1;
    const fresh: Item = { ...item, status: "importing", progress: 0, error: undefined, began: performance.now(), attempt };
    patch(item.id, fresh);
    const report = (p: number) => patch(item.id, { progress: Math.min(Math.max(p, 0), 1) });
    const job = onUpload && item.file ? onUpload(item.file, report) : simulate(fresh, report);
    job.then(
      () => { patch(item.id, { status: "done", progress: 1 }); if (alive.current && !removed.current.has(item.id)) setSaid(`Imported ${item.name}`); },
      (err: unknown) => {
        const error = err instanceof Error && err.message ? err.message : "Couldn't import the file";
        patch(item.id, { status: "failed", error, retryable: true });
        if (alive.current && !removed.current.has(item.id)) setSaid(`Couldn't import ${item.name}: ${error}`);
      },
    );
  };

  /** New rows arrive a beat apart; each starts importing as it opens. */
  const add = (incoming: { name: string; size: number; file?: File; failOnce?: boolean }[]) => {
    const exts = accept.map((a) => a.toLowerCase().replace(/^\./, ""));
    const fresh = incoming.map((f, i): Item => {
      const id = `import-${++nextId.current}`;
      const base: Item = { id, name: f.name, size: f.size, file: f.file, kind: kindOf(f.name), status: "importing", progress: 0, began: 0, attempt: 0, delay: i * motionTokens.stagger.row * 1000, failOnce: f.failOnce };
      if (exts.length && !exts.includes(ext(f.name))) return { ...base, status: "failed", error: "Can't import this type", retryable: false };
      if (f.size > maxSize) return { ...base, status: "failed", error: `Larger than ${formatBytes(maxSize)}`, retryable: false };
      return base;
    });
    setItems((list) => [...list, ...fresh]);
    const rejected = fresh.filter((f) => f.status === "failed");
    if (rejected.length) setSaid(rejected.map((r) => `Couldn't import ${r.name}: ${r.error}`).join(". "));
    fresh.forEach((f) => { if (f.status === "importing") later(() => run(f), f.delay); });
  };

  const remove = (id: string) => {
    removed.current.add(id);
    patch(id, { leaving: true });
    later(() => setItems((list) => list.filter((i) => i.id !== id)), FOLD_MS);
  };

  // The preview's sample: files hover, then drop.
  useEffect(() => {
    if (!autoplay) return;
    const a = window.setTimeout(() => setOver(SAMPLE.length), 700);
    const b = window.setTimeout(() => { setOver(0); add(SAMPLE); }, 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  const fileCount = (e: DragEvent) => Array.from(e.dataTransfer.items).filter((i) => i.kind === "file").length;
  const onDragEnter = (e: DragEvent) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setOver(Math.max(1, fileCount(e))); };
  const onDragOver = (e: DragEvent) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(0);
    add(Array.from(e.dataTransfer.files).map((file) => ({ name: file.name, size: file.size, file })));
  };

  const live = items.filter((i) => !i.leaving);
  const done = live.filter((i) => i.status === "done").length;
  const pose = over ? FAN : hot ? HOT : REST;
  const types = accept.map((a) => a.replace(/^\./, "").toUpperCase());
  const defaultHint = `${types.length > 1 ? `${types.slice(0, -1).join(", ")} or ${types[types.length - 1]}` : types[0] ?? "Any file"}, up to ${formatBytes(maxSize)}`;

  return (
    <MotionConfig reducedMotion="user">
      <Tray className={[styles.dropzone, className].filter(Boolean).join(" ")}
        title={<><Upload aria-hidden />Import</>}
        meta={live.length ? <span><RollNumber value={done} /> of <RollNumber value={live.length} /> imported</span> : undefined}>
        <div className={styles.body}>
          <button type="button" className={styles.drop} data-over={over > 0 || undefined} aria-describedby={hintId}
            onClick={() => picker.current?.click()} onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}
            onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={() => setOver(0)} onDrop={onDrop}>
            <span className={styles.frames} aria-hidden>
              {REST.map((_, i) => (
                <motion.span key={i} className={styles.frame} data-front={i === 1 || undefined} initial={false} animate={pose[i]} transition={motionTokens.spring.morph}>
                  <FilmFrame />
                </motion.span>
              ))}
            </span>
            <RollText className={styles.title} text={over ? `Drop ${over} file${over === 1 ? "" : "s"}` : "Drop recordings, b-roll or audio"} />
            <span id={hintId} className={styles.hint}>{hint ?? `${defaultHint}. Or click to choose.`}</span>
          </button>
          <input ref={picker} type="file" multiple accept={accept.join(",")} hidden tabIndex={-1}
            onChange={(e) => { add(Array.from(e.target.files ?? []).map((file) => ({ name: file.name, size: file.size, file }))); e.target.value = ""; }} />

          {items.length > 0 && (
            <ul className={styles.rows}>
              {items.map((item) => <Row key={item.id} item={item} onRetry={() => run(item)} onRemove={() => remove(item.id)} />)}
            </ul>
          )}
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{said}</span>
      </Tray>
    </MotionConfig>
  );
}

/** One file: kind, name and size on top; the bar and what's left under it. Folds open on arrival and shut on removal. */
function Row({ item, onRetry, onRemove }: { item: Item; onRetry: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOpen(true), item.delay + 16);
    return () => clearTimeout(id);
  }, [item.delay]);
  const elapsed = item.began ? performance.now() - item.began : 0;
  const eta = item.progress > 0.04 ? (elapsed * (1 - item.progress)) / item.progress : null;
  const pct = Math.round(item.progress * 100);
  return (
    <li className={styles.row}>
      <Fold open={open && !item.leaving} className={styles.fold}>
        <div className={styles.rowBody} data-status={item.status}>
          <div className={styles.line}>
            <Tag size="sm">{KIND_LABEL[item.kind]}</Tag>
            <span className={styles.name} title={item.name}>{item.name}</span>
            <span className={styles.size}>{formatBytes(item.size)}</span>
            <IconKey size="sm" label={`Remove ${item.name}`} tooltip={false} onClick={onRemove}><X /></IconKey>
          </div>
          <div className={styles.line}>
            <span className={styles.bar} role="progressbar" aria-label={`Importing ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span className={styles.fill} style={{ "--p": item.progress } as CSSProperties} />
            </span>
            <span className={styles.state}>
              <Swap id={item.status === "importing" ? (eta === null ? "starting" : "eta") : item.status}>
                {item.status === "done" ? <span className={styles.done}><DrawCheck size={13} />Imported</span>
                  : item.status === "failed" ? <span className={styles.error}>{item.error}</span>
                  : eta === null ? <span className={styles.eta}>Starting</span>
                  : <span className={styles.eta}><span className={styles.time}>{left(eta)}</span> left</span>}
              </Swap>
              {item.status === "failed" && item.retryable && (
                <Key size="sm" variant="tertiary" aria-label={`Retry ${item.name}`} onClick={onRetry}><RotateCcw />Retry</Key>
              )}
            </span>
          </div>
        </div>
      </Fold>
    </li>
  );
}
