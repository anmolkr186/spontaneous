/**
 * CommandMenu: ⌘K for the editor. One field searches every command; the list
 * under it groups them (Suggestions, Edit, Go to). It reads top to bottom:
 * what you typed, what it found, and in the footer row either the keys that
 * move you around or what just ran.
 *
 * A key-material highlight glides from row to row. ↵ runs the highlighted row:
 * it gives a short press, then a check draws itself in the footer next to what
 * happened ("Added a zoom at 0:12"). Matching letters stay bright while the
 * rest of a label dims. Words that match nothing become a question for the agent.
 *
 * It renders as a dock slab; the app shows it in a dialog and closes it in onClose.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { AudioLines, Clapperboard, Film, Gauge, ListChecks, MessageSquare, Scissors, Search, SlidersHorizontal, SquareSplitHorizontal, StickyNote, Undo2, Upload, ZoomIn } from "lucide-react";
import { DrawCheck, Kbd, Mark, RollText, Swap } from "@/ui/atoms";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./command-menu.module.css";

export interface Command {
  /** Passed to onRun. The agent fallback runs as "ask". */
  id: string;
  /** What it does, in a few words ("Split at playhead"). */
  label: string;
  /** A 14px lucide icon. */
  icon?: ReactNode;
  /** A short muted note after the label ("at 0:12"). */
  hint?: string;
  /** Shortcut caps on the right, one entry per cap: ["⌘", "Z"]. Suggestions get ⌘1–⌘5 on their own. */
  keys?: string[];
  /** More words that find this command. */
  keywords?: string[];
  /** What the footer says once it ran ("Added a zoom at 0:12"). onRun can say it instead. */
  done?: string;
}

export interface CommandGroup {
  /** "suggestions" is special: its first five commands run with ⌘1–⌘5. */
  id: string;
  label: string;
  commands: Command[];
}

export interface CommandMenuProps {
  /** The commands, in groups. Defaults to the editor's. */
  groups?: CommandGroup[];
  /** Text in the empty field. */
  placeholder?: string;
  /** A command ran. The agent fallback sends "ask" with the typed words. Return a sentence to show in the footer instead of the command's `done`. */
  onRun?: (id: string, query?: string) => string | void;
  /** Esc in an empty field: close the dialog here. */
  onClose?: () => void;
  /** Focus the field when the menu appears. */
  autoFocus?: boolean;
  className?: string;
}

/** The editor's commands. Times in `done` are the demo project's playhead and selection. */
export const EDITOR_COMMANDS: CommandGroup[] = [
  {
    id: "suggestions",
    label: "Suggestions",
    commands: [
      { id: "apply-notes", label: "Apply 2 open notes", icon: <ListChecks />, keywords: ["notes", "agent"], done: "Sent 2 notes to the agent" },
      { id: "add-zoom", label: "Add a zoom at the playhead", icon: <ZoomIn />, keywords: ["camera", "focus"], done: "Added a zoom at 0:12" },
      { id: "trim-silences", label: "Trim silences", icon: <AudioLines />, keywords: ["pauses", "gaps", "audio"], done: "Trimmed 4 silences" },
      { id: "export-1080p", label: "Export 1080p", icon: <Upload />, keywords: ["render", "video", "mp4"], done: "Exporting 1080p" },
      { id: "ask", label: "Ask the agent…", icon: <Mark size={14} title="" />, keywords: ["claude", "help"], done: "Asking the agent" },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    commands: [
      { id: "split", label: "Split at playhead", icon: <SquareSplitHorizontal />, keys: ["S"], done: "Split at 0:12" },
      { id: "cut", label: "Cut selection", icon: <Scissors />, keys: ["⌫"], keywords: ["delete", "remove"], done: "Cut 0:42–0:51" },
      { id: "speed-up", label: "Speed up selection", icon: <Gauge />, keywords: ["faster", "timing"], done: "Sped up 0:42–0:51 to 1.5×" },
      { id: "callout", label: "Add callout", icon: <MessageSquare />, keywords: ["label", "overlay", "text"], done: "Added a callout at 0:12" },
      { id: "undo", label: "Undo", icon: <Undo2 />, keys: ["⌘", "Z"], done: "Undid the cut" },
    ],
  },
  {
    id: "go",
    label: "Go to",
    commands: [
      { id: "go-notes", label: "Notes", icon: <StickyNote />, keywords: ["open", "panel"], done: "Opened Notes" },
      { id: "go-shots", label: "Shot library", icon: <Clapperboard />, keywords: ["open", "templates", "camera"], done: "Opened the shot library" },
      { id: "go-timeline", label: "Timeline", icon: <Film />, keywords: ["open", "tracks", "studio"], done: "Opened the timeline" },
      { id: "go-export", label: "Export settings", icon: <SlidersHorizontal />, keywords: ["open", "resolution", "format"], done: "Opened export settings" },
    ],
  },
];

type Row = { key: string; cmd: Command; hits: number[] | null; keys?: string[] };
type Section = { id: string; label: string; rows: Row[] };

/**
 * Where `q` matches `text`: a run of letters if it appears whole, otherwise
 * its letters in order. Returns the matched indices, or null for no match.
 */
function matchText(text: string, q: string): number[] | null {
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return Array.from({ length: q.length }, (_, i) => at + i);
  const letters = q.replace(/\s+/g, "");
  const hits: number[] = [];
  for (let i = 0, j = 0; i < t.length && j < letters.length; i++) if (t[i] === letters[j]) { hits.push(i); j++; }
  return hits.length === letters.length && letters.length ? hits : null;
}

function search(groups: CommandGroup[], query: string): Section[] {
  const q = query.trim().toLowerCase();
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    rows: g.commands.flatMap((cmd, i): Row[] => {
      const keys = cmd.keys ?? (g.id === "suggestions" && i < 5 ? ["⌘", String(i + 1)] : undefined);
      const row = { key: `${g.id}:${cmd.id}`, cmd, keys };
      if (!q) return [{ ...row, hits: null }];
      const hits = matchText(cmd.label, q);
      if (hits) return [{ ...row, hits }];
      return cmd.keywords?.some((k) => k.toLowerCase().includes(q)) ? [{ ...row, hits: [] }] : [];
    }),
  })).filter((s) => s.rows.length);
}

/** A label with the matched letters bright and the rest dimmed. */
function Matched({ text, hits }: { text: string; hits: number[] | null }) {
  if (!hits) return <span className={styles.label}>{text}</span>;
  const set = new Set(hits);
  const parts: { hit: boolean; s: string }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.s += text[i];
    else parts.push({ hit, s: text[i]! });
  }
  return <span className={styles.label} data-filtered>{parts.map((p, i) => <span key={i} className={p.hit ? styles.hit : undefined}>{p.s}</span>)}</span>;
}

const PRESS_MS = 140;
const SHOW_DONE_MS = 2600;

export function CommandMenu({ groups = EDITOR_COMMANDS, placeholder = "Type a command or search…", onRun, onClose, autoFocus, className }: CommandMenuProps) {
  const uid = useId();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [ran, setRan] = useState<{ n: number; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const byKeys = useRef(false);
  const pressTimer = useRef(0);
  const doneTimer = useRef(0);

  const asked = query.trim();
  const sections = useMemo(() => {
    const found = search(groups, query);
    if (found.length || !asked) return found;
    // Nothing matched: offer the words to the agent.
    const ask: Row = { key: "ask:fallback", cmd: { id: "ask", label: `Ask the agent: “${asked}”`, icon: <Mark size={14} title="" />, done: "Asked the agent" }, hits: null, keys: ["↵"] };
    return [{ id: "ask", label: "Agent", rows: [ask] }];
  }, [groups, query, asked]);
  const rows = sections.flatMap((s) => s.rows);
  const active = rows.find((r) => r.key === activeKey) ?? rows[0];
  const rowId = (key: string) => `${uid}-row-${key}`;
  const listId = `${uid}-list`;

  useEffect(() => () => { clearTimeout(pressTimer.current); clearTimeout(doneTimer.current); }, []);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // ⌘K focuses the field from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keyboard moves keep the highlighted row in view; the pointer never scrolls the list.
  useEffect(() => {
    if (!byKeys.current || !active) return;
    byKeys.current = false;
    document.getElementById(rowId(active.key))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key]);

  // The list glides to the height of what it found.
  useLayoutEffect(() => {
    const l = list.current, c = inner.current;
    if (!l || !c) return;
    const fit = () => l.style.setProperty("--list-h", `${c.offsetHeight}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const ready = requestAnimationFrame(() => l.setAttribute("data-ready", ""));
    return () => { ro.disconnect(); cancelAnimationFrame(ready); };
  }, []);

  const run = (row: Row) => {
    setActiveKey(row.key);
    setPressing(row.key);
    clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      setPressing(null);
      const said = onRun?.(row.cmd.id, row.cmd.id === "ask" ? asked : undefined);
      setRan((r) => ({ n: (r?.n ?? 0) + 1, text: typeof said === "string" ? said : row.cmd.done ?? row.cmd.label }));
      clearTimeout(doneTimer.current);
      doneTimer.current = window.setTimeout(() => setRan(null), SHOW_DONE_MS);
    }, reduced ? 0 : PRESS_MS);
  };

  const step = (by: number) => {
    if (!rows.length) return;
    const i = active ? rows.indexOf(active) : -1;
    byKeys.current = true;
    setActiveKey(rows[(i + by + rows.length) % rows.length]!.key);
  };

  const jumpSection = (by: number) => {
    if (!sections.length) return;
    const at = Math.max(0, sections.findIndex((s) => active && s.rows.includes(active)));
    const to = sections[(at + by + sections.length) % sections.length]!;
    byKeys.current = true;
    setActiveKey(to.rows[0]!.key);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
      const g = groups.find((x) => x.id === "suggestions");
      const cmd = g?.commands[Number(e.key) - 1];
      if (!g || !cmd) return;
      e.preventDefault();
      run({ key: `${g.id}:${cmd.id}`, cmd, hits: null });
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Tab") { e.preventDefault(); jumpSection(e.shiftKey ? -1 : 1); }
    else if (e.key === "Enter") { if (active) { e.preventDefault(); run(active); } }
    else if (e.key === "Escape") {
      e.preventDefault();
      if (query) { setQuery(""); setActiveKey(null); } else onClose?.();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={[styles.menu, className].filter(Boolean).join(" ")}>
        <label className={styles.field}>
          <Search aria-hidden />
          <input ref={input} className={styles.input} value={query} placeholder={placeholder} spellCheck={false} autoComplete="off"
            role="combobox" aria-label="Search commands" aria-expanded={rows.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={active ? rowId(active.key) : undefined}
            onChange={(e) => { setQuery(e.target.value); setActiveKey(null); }} onKeyDown={onKeyDown} />
        </label>

        <motion.div ref={list} layoutScroll className={styles.list}>
          <div ref={inner} id={listId} role="listbox" aria-label="Commands" className={styles.inner}>
            {sections.map((s) => (
              <div key={s.id} role="group" aria-labelledby={`${uid}-group-${s.id}`} className={styles.group}>
                <div id={`${uid}-group-${s.id}`} className={styles.groupLabel}>{s.label}</div>
                {s.rows.map((row) => {
                  const on = row.key === active?.key;
                  return (
                    <div key={row.key} id={rowId(row.key)} role="option" aria-selected={on} className={styles.row}
                      data-active={on || undefined} data-pressing={pressing === row.key || undefined}
                      // Keep focus in the field; the pointer only moves the highlight.
                      onMouseDown={(e) => e.preventDefault()} onPointerMove={() => { byKeys.current = false; if (!on) setActiveKey(row.key); }} onClick={() => run(row)}>
                      {on && <motion.span layoutId={`${uid}-highlight`} className={styles.highlight} transition={motionTokens.spring.snappy} />}
                      <span className={styles.icon} aria-hidden>{row.cmd.icon}</span>
                      <Matched text={row.cmd.label} hits={row.hits} />
                      {row.cmd.hint && <span className={styles.hint}>{row.cmd.hint}</span>}
                      {row.keys && <span className={styles.keys} aria-hidden>{row.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </motion.div>

        <div className={styles.foot}>
          <Swap id={ran ? `ran-${ran.n}` : "hints"} className={styles.footSlot}>
            {ran ? (
              <span className={styles.ran}><DrawCheck size={13} className={styles.check} />{ran.text}</span>
            ) : (
              <span className={styles.hints} aria-hidden>
                <span><Kbd>↑</Kbd><Kbd>↓</Kbd>Move</span>
                <span><Kbd>Tab</Kbd>Section</span>
                <span><Kbd>↵</Kbd>Run</span>
              </span>
            )}
          </Swap>
          <span className={styles.esc} aria-hidden><Kbd>esc</Kbd><RollText text={query ? "Clear" : "Close"} /></span>
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{ran?.text ?? ""}</span>
      </div>
    </MotionConfig>
  );
}
