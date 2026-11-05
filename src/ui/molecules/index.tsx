import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Clock3, Mic, Pause, X } from "lucide-react";
import { Key, RollNumber, Tag } from "@/ui/atoms";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import type { Note } from "@/editor/model";
import { formatTime } from "@/editor/model";
import { motionTokens } from "@/ui/tokens/motion";
import { CtaKey, noteActionLabel } from "@/ui/cta";
import styles from "./molecules.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────────────────────── Layout ───────────────────────── */

/** A full-height column. `header` sits in the titlebar row. */
export function Panel({ header, children, className, ...props }: HTMLAttributes<HTMLElement> & { header?: ReactNode }) {
  return (
    <section className={cx(styles.panel, className)} {...props}>
      {header && <header className={styles.panelHeader}>{header}</header>}
      {children}
    </section>
  );
}

/** A titled group of controls. */
export function Group({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.group}>
      {title && <h3 className={styles.groupHead}><span className={styles.groupTitle}>{title}</span>{aside}</h3>}
      {children}
    </div>
  );
}

/** Label + control on a fixed label column so controls line up across groups. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span>{children}</span>
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className={styles.hint}>{children}</p>;
}

/* ───────────────────────── Switcher ───────────────────────── */

export interface SwitcherOption<T extends string> {
  value: T;
  /** The words on the option. Leave out for an icon-only option and give it an `ariaLabel`. */
  label?: string;
  /** A lucide icon before the label. */
  icon?: ReactNode;
  /** Open items, in ink ("Notes 2"). Zero shows nothing; a new count blurs in and its digits roll. */
  count?: number;
  /** A short neutral tag after the label ("Beta"). Words, never a hue. */
  badge?: string;
  /** Can't be picked: arrow keys skip it and the key never lands on it. */
  disabled?: boolean;
  /** Accessible name for an icon-only option. */
  ariaLabel?: string;
  /** With kind="tabs": the id of the panel this tab shows. */
  controls?: string;
}

export interface SwitcherProps<T extends string> {
  options: SwitcherOption<T>[];
  /** The chosen option. Leave out and the switcher holds its own value. */
  value?: T;
  /** Starting value when uncontrolled. Defaults to the first enabled option. */
  defaultValue?: T;
  /** Called with the new value on click, on arrow keys, and while the key is dragged across options. */
  onChange?: (value: T) => void;
  /** Names the group for assistive tech ("Editor mode"). */
  label: string;
  /** Stretch to the container with equal options. */
  full?: boolean;
  /** 24, 30 or 34px tall. Default md. */
  size?: "sm" | "md" | "lg";
  /** A radiogroup for modes and enums, or a tablist that switches panels (give each option `controls`). */
  kind?: "radio" | "tabs";
  /** Turns the whole switcher off. */
  disabled?: boolean;
  className?: string;
}

type Press = { id: number; x: number; touch: boolean; drag: boolean; moved: boolean; grab: number; over: number };

/** The key's edges travel separately: the one facing the target leads and the other trails, so it stretches a little and settles. */
const LEAD = { duration: 0.27, ease: motionTokens.ease.standard };
const TRAIL = { duration: 0.4, ease: motionTokens.ease.standard };
/** While dragged, the key follows the pointer a touch behind, so picking it up never jumps. */
const FOLLOW = { type: "spring", stiffness: 900, damping: 60 } as const;

/**
 * Mutually exclusive options in a well; the chosen one rises as a key. The key
 * glides to a new pick with its leading edge running ahead, gives a little
 * when pressed, and can be dragged across the options, picking as it goes; on
 * release it snaps into place. Options are as wide as their content, so a
 * label or count that changes makes the option (and the well) glide to its new
 * width, and the key follows. Used for modes, panels, inspector tabs and small enums.
 */
export function Switcher<T extends string>({ options, value, defaultValue, onChange, label, full, size = "md", kind = "radio", disabled, className }: SwitcherProps<T>) {
  const reduced = useReducedMotion();
  const [own, setOwn] = useState<T | undefined>(() => defaultValue ?? options.find((o) => !o.disabled)?.value);
  const current = value !== undefined ? value : own;
  const active = options.findIndex((o) => o.value === current);
  const tabbable = active >= 0 ? active : options.findIndex((o) => !o.disabled);
  const tabs = kind === "tabs";

  const root = useRef<HTMLDivElement>(null);
  const opts = useRef<(HTMLButtonElement | null)[]>([]);
  opts.current.length = options.length;
  // The rendered pick, for handlers that outlive a render. A parent that refuses a pick puts the key back.
  const latest = useRef(current);
  latest.current = current;
  const [placed, setPlaced] = useState(false);
  const [pressed, setPressed] = useState(false);
  const press = useRef<Press | null>(null);
  const dragging = useRef(false);

  // The key is two edges. While dragged it is a center and a span instead.
  const left = useMotionValue(0);
  const right = useMotionValue(0);
  const width = useTransform([left, right], ([l, r]: number[]) => r! - l!);
  const center = useMotionValue(0);
  const span = useMotionValue(0);
  const aim = useRef({ l: 0, r: 0 });
  const glideEnds = useRef(0);
  const shown = useRef<T | undefined>(undefined);

  const select = (v: T) => {
    const o = options.find((x) => x.value === v);
    if (!o || o.disabled || disabled || v === latest.current) return;
    if (value === undefined) setOwn(v);
    onChange?.(v);
  };

  /** Where the key belongs: the chosen option's box inside the well. */
  const target = () => {
    const b = opts.current[options.findIndex((o) => o.value === latest.current)];
    return b && b.offsetWidth ? { l: b.offsetLeft, r: b.offsetLeft + b.offsetWidth } : null;
  };

  /** jump: no motion. glide: a new pick. retarget: the pick's box moved mid-glide. snap: dropped after a drag. */
  const place = (how: "jump" | "glide" | "retarget" | "snap") => {
    const t = target();
    if (!t) return;
    const moved = Math.abs(t.l - aim.current.l) > 0.5 || Math.abs(t.r - aim.current.r) > 0.5;
    aim.current = t;
    if (how === "jump" || reduced) { left.jump(t.l); right.jump(t.r); setPlaced(true); return; }
    if (how === "snap") {
      glideEnds.current = performance.now() + motionTokens.spring.snappy.visualDuration * 1000;
      animate(left, t.l, motionTokens.spring.snappy);
      animate(right, t.r, motionTokens.spring.snappy);
      return;
    }
    if (how === "retarget") {
      if (!moved) return;
      const rest = { duration: Math.max((glideEnds.current - performance.now()) / 1000, 0.12), ease: motionTokens.ease.standard };
      animate(left, t.l, rest);
      animate(right, t.r, rest);
      return;
    }
    const toRight = t.l > left.get();
    glideEnds.current = performance.now() + TRAIL.duration * 1000;
    animate(left, t.l, toRight ? TRAIL : LEAD);
    animate(right, t.r, toRight ? LEAD : TRAIL);
  };

  /** Options take their content's width through a CSS variable, so a change glides. Full switchers share the width equally. */
  const measure = () => {
    const bs = opts.current.filter((b): b is HTMLButtonElement => !!b);
    if (!bs.length) return;
    if (full) { bs.forEach((b) => b.style.removeProperty("--opt-w")); return; }
    const cs = getComputedStyle(bs[0]!);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    bs.forEach((b) => {
      const content = b.firstElementChild as HTMLElement | null;
      if (content) b.style.setProperty("--opt-w", `${content.offsetWidth + pad}px`);
    });
  };

  const latestFns = useRef({ place, measure });
  latestFns.current = { place, measure };

  // Every render: a label or count may have changed, so options re-measure (and glide).
  useLayoutEffect(measure);

  // A new pick: the key glides there, and focus follows if it was inside.
  useLayoutEffect(() => {
    if (shown.current === current) return;
    const first = shown.current === undefined;
    shown.current = current;
    if (!dragging.current) place(first || !placed ? "jump" : "glide");
    const b = opts.current[active];
    if (!first && b && root.current?.contains(document.activeElement)) b.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Widths change during a glide, a font load or a container resize: the key follows, a frame behind.
  const keys = options.map((o) => o.value).join("\n");
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const sync = () => {
      latestFns.current.measure();
      if (dragging.current) return;
      latestFns.current.place(performance.now() < glideEnds.current ? "retarget" : "jump");
    };
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); });
    ro.observe(el);
    el.querySelectorAll(`.${styles.switcherOption}, .${styles.switcherContent}`).forEach((n) => ro.observe(n));
    // Width glides switch on after the first measure, so nothing grows in on load.
    const ready = requestAnimationFrame(() => el.setAttribute("data-ready", ""));
    return () => { ro.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(ready); };
  }, [keys, full, size]);

  /* Dragging: the key rides the pointer, keeps inside the well, and its width settles to the option under it. */
  const follow = () => {
    if (!dragging.current) return;
    const first = opts.current[0], last = opts.current[options.length - 1];
    if (!first || !last) return;
    const w = span.get();
    const lo = first.offsetLeft + w / 2;
    const hi = Math.max(lo, last.offsetLeft + last.offsetWidth - w / 2);
    const c = Math.min(Math.max(center.get(), lo), hi);
    left.set(c - w / 2);
    right.set(c + w / 2);
  };
  useMotionValueEvent(center, "change", follow);
  useMotionValueEvent(span, "change", follow);

  const localX = (clientX: number) => clientX - (root.current?.getBoundingClientRect().left ?? 0);

  /** The option under (or nearest to) a horizontal pointer position. */
  const indexAt = (clientX: number) => {
    let best = -1;
    let dist = Infinity;
    opts.current.forEach((b, i) => {
      if (!b) return;
      const r = b.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  };

  const startDrag = () => {
    dragging.current = true;
    left.stop();
    right.stop();
    center.jump((left.get() + right.get()) / 2);
    span.jump(right.get() - left.get());
    const t = target();
    if (t) animate(span, t.r - t.l, motionTokens.spring.snappy);
  };

  const endPress = () => {
    press.current = null;
    setPressed(false);
    if (!dragging.current) return;
    dragging.current = false;
    place("snap");
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    const i = indexAt(e.clientX);
    const o = options[i];
    const b = opts.current[i];
    if (!o || !b || o.disabled) return;
    const touch = e.pointerType === "touch";
    // Touch picks on lift, so a swipe past the switcher never picks; the key itself can still be dragged.
    const drag = !touch || o.value === latest.current;
    press.current = { id: e.pointerId, x: e.clientX, touch, drag, moved: false, grab: localX(e.clientX) - (b.offsetLeft + b.offsetWidth / 2), over: i };
    if (drag) setPressed(true);
    if (touch) return;
    select(o.value);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.abs(e.clientX - p.x) < (p.touch ? 8 : 3)) return;
    if (!p.moved) {
      p.moved = true;
      if (p.drag) startDrag();
    }
    if (!p.drag) return;
    const to = localX(e.clientX) - p.grab;
    if (reduced) center.set(to); else animate(center, to, FOLLOW);
    const i = indexAt(e.clientX - p.grab);
    const o = options[i];
    const b = opts.current[i];
    if (!o || !b || o.disabled || i === p.over) return;
    p.over = i;
    select(o.value);
    animate(span, b.offsetWidth, motionTokens.spring.snappy);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.touch && !p.moved) {
      const o = options[indexAt(e.clientX)];
      if (o) select(o.value);
    }
    endPress();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]));
    const n = enabled.length;
    if (!n) return;
    const at = enabled.indexOf(options.findIndex((o) => o.value === latest.current));
    const back = e.key === "ArrowLeft" || (!tabs && e.key === "ArrowUp");
    const next = e.key === "ArrowRight" || (!tabs && e.key === "ArrowDown");
    const to = back ? enabled[at < 0 ? n - 1 : (at - 1 + n) % n]
      : next ? enabled[at < 0 ? 0 : (at + 1) % n]
      : e.key === "Home" ? enabled[0]
      : e.key === "End" ? enabled[n - 1]
      : undefined;
    if (to === undefined) return;
    e.preventDefault();
    select(options[to]!.value);
    opts.current[to]?.focus();
  };

  return (
    <div ref={root} role={tabs ? "tablist" : "radiogroup"} aria-label={label} aria-orientation={tabs ? "horizontal" : undefined} aria-disabled={disabled || undefined}
      className={cx(styles.switcher, className)} data-full={full || undefined} data-size={size} data-pressed={pressed || undefined} data-disabled={disabled || undefined}
      onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={endPress} onLostPointerCapture={endPress}>
      <motion.span aria-hidden className={styles.switcherKey} data-placed={(placed && active >= 0) || undefined} style={{ x: left, width }} />
      {options.map((o, i) => {
        const on = i === active;
        const name = [o.ariaLabel ?? o.label ?? o.value, o.count ? String(o.count) : "", o.badge ?? ""].filter(Boolean).join(", ");
        return (
          <button key={o.value} ref={(el) => { opts.current[i] = el; }} type="button" role={tabs ? "tab" : "radio"}
            aria-checked={tabs ? undefined : on} aria-selected={tabs ? on : undefined} aria-controls={tabs ? o.controls : undefined} aria-label={name}
            tabIndex={i === tabbable ? 0 : -1} disabled={o.disabled || disabled} className={styles.switcherOption} data-on={on || undefined}
            // Keyboard and assistive tech. Pointer picks happen on the well, on press.
            onClick={(e) => { if (e.detail === 0) select(o.value); }}>
            <span className={styles.switcherContent}>
              {o.icon && <span className={styles.switcherIcon}>{o.icon}</span>}
              {o.label && (
                // The strong copy holds the width; the two crossfade, so neighbours never shift.
                <span className={styles.switcherLabel}><span>{o.label}</span><span aria-hidden>{o.label}</span></span>
              )}
              {!!o.count && <span className={styles.count}><RollNumber value={o.count} /></span>}
              {o.badge && <Tag size="sm">{o.badge}</Tag>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A quiet text trigger that opens a list of options above it. `display` can say
 * more than the option's label, and `hint` explains the current choice on hover.
 */
export function MenuSelect({ label, display, hint, value, options, onChange }: { label: string; display: string; hint?: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const trigger = (
    <DropdownMenu.Trigger className={styles.menuTrigger} aria-label={`${label}: ${display}`}>
      {display}<ChevronDown size={12} />
    </DropdownMenu.Trigger>
  );
  return (
    <DropdownMenu.Root modal={false}>
      {hint ? <Tooltip content={hint}>{trigger}</Tooltip> : trigger}
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} side="top" align="start" sideOffset={6} collisionPadding={8}>
          <DropdownMenu.Label className={styles.menuLabel}>{label}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className={styles.menuItem}>
                {o.label}
                <DropdownMenu.ItemIndicator className={styles.menuCheck}><Check size={13} /></DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ───────────────────────── Dock keys ───────────────────────── */

/** An on/off key with an icon and a label that states the current setting ("No microphone"). */
export function ToggleKey({ on, onChange, iconOn, iconOff, labelOn, labelOff }: { on: boolean; onChange: (on: boolean) => void; iconOn: ReactNode; iconOff: ReactNode; labelOn: string; labelOff: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={styles.toggle} onClick={() => onChange(!on)}>
      {on ? iconOn : iconOff}{on ? labelOn : labelOff}
    </button>
  );
}

/**
 * An icon + label key for choosing what to record. Once it points at something
 * specific (a window, an area) it shows that, with a clear button to drop it.
 */
export function SourceKey({ icon, label, selected, onSelect, onClear, disabled }: { icon: ReactNode; label: string; selected: boolean; onSelect: () => void; onClear?: () => void; disabled?: boolean }) {
  const clearable = selected && !!onClear;
  return (
    <span className={styles.sourceWrap}>
      <button type="button" role="radio" aria-checked={selected} className={styles.source} data-clearable={clearable || undefined} onClick={onSelect} disabled={disabled}>
        {icon}<span className={styles.sourceLabel}>{label}</span>
      </button>
      {clearable && (
        <button type="button" className={styles.sourceClear} aria-label={`Clear ${label}`} title="Clear" onClick={onClear}>
          <X />
        </button>
      )}
    </span>
  );
}

/* ───────────────────────── NoteCard ───────────────────────── */

const INTENT: Record<string, string> = { zoom: "Zoom", blur: "Blur", callout: "Callout", speed: "Timing", cut: "Cut", style: "Style" };

export interface NoteCardProps {
  note: Note;
  index: number;
  selected?: boolean;
  onSeek?: (t: number) => void;
  onApply?: () => void;
  onDismiss?: () => void;
  /** Takes a queued note back out of the queue. */
  onUnqueue?: () => void;
  onSelect?: () => void;
}

/**
 * A note pinned to a moment. It leads with what you scan for: the pin number
 * (matching the pin on the frame) and the time. Its state reads in the footer:
 * open notes offer Apply, queued ones can be taken back, applying ones show
 * progress, applied ones collapse to a single quiet line.
 */
export function NoteCard({ note, index, selected, onSeek, onApply, onDismiss, onUnqueue, onSelect }: NoteCardProps) {
  const applied = note.status === "applied";
  const edits = note.resolvedBy?.length ?? 0;
  const stop = (fn?: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn?.(); };
  return (
    <article className={styles.note} data-status={note.status} data-selected={selected || undefined} onClick={onSelect}>
      <header className={styles.noteHead}>
        <span className={styles.notePin} aria-label={`Note ${index}`}>{index}</span>
        <Tooltip content={`Added ${note.createdAt}`} side="top">
          <button type="button" className={styles.timeChip} onClick={stop(() => onSeek?.(note.at))} aria-label={`Go to ${formatTime(note.at)}`}>
            {formatTime(note.at)}
          </button>
        </Tooltip>
        {note.voice && <VoiceChip seconds={note.voice.seconds} />}
        <span className={styles.grow} />
        {applied && <span className={styles.resolved}><Check />{edits ? `${edits} edit${edits > 1 ? "s" : ""}` : "Applied"}</span>}
      </header>
      <p className={styles.noteText}>{note.text}</p>
      {!applied && (
        <footer className={styles.noteFoot}>
          <span className={styles.intents}>{note.intents.map((i) => <Tag key={i} size="sm">{INTENT[i]}</Tag>)}</span>
          {note.status === "open" && (
            <>
              <Key size="sm" variant="tertiary" onClick={stop(onDismiss)}>Dismiss</Key>
              <CtaKey size="sm" intent="run" role="secondary" label={noteActionLabel(note.intents)} onClick={stop(onApply)} />
            </>
          )}
          {note.status === "queued" && (
            <>
              <span className={styles.noteState}><Clock3 />Queued</span>
              <Key size="sm" variant="tertiary" onClick={stop(onUnqueue)}>Cancel</Key>
            </>
          )}
          {note.status === "applying" && <span className={styles.noteState} data-live><span className={styles.spinner} />Applying</span>}
        </footer>
      )}
    </article>
  );
}

/**
 * A voice note: play it back from the card. The transcript is the note's text,
 * so the chip only carries play state and length; a fill tracks playback.
 */
function VoiceChip({ seconds }: { seconds: number }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setPlaying(false), seconds * 1000);
    return () => clearTimeout(id);
  }, [playing, seconds]);
  return (
    <button type="button" className={styles.voice} aria-pressed={playing} aria-label={playing ? "Pause voice note" : "Play voice note"}
      style={{ "--voice-duration": `${seconds}s` } as CSSProperties}
      onClick={(e) => { e.stopPropagation(); setPlaying(!playing); }}>
      <span className={styles.voiceFill} key={String(playing)} />
      {playing ? <Pause /> : <Mic />}
      <span className={styles.voiceTime}>{formatTime(seconds)}</span>
    </button>
  );
}

/** Backdrops to choose from. `wide` shows image backdrops at the frame's shape, in a scrolling grid. */
export function SwatchPicker({ options, value, onChange, wide }: { options: { id: string; label: string; css: string }[]; value: string; onChange: (id: string) => void; wide?: boolean }) {
  return (
    <div className={styles.swatches} data-wide={wide || undefined} role="radiogroup" aria-label="Background">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} aria-label={o.label} title={o.label} className={styles.swatch} style={{ background: o.css }} onClick={() => onChange(o.id)} />
      ))}
    </div>
  );
}
export { Tray, TrayCard, TrayRow, TraySpacer } from "./tray";
