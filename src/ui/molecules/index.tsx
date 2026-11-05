import { useEffect, useId, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Clock3, Mic, Pause, X } from "lucide-react";
import { Key, Tag } from "@/ui/atoms";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import type { Note } from "@/editor/model";
import { formatTime } from "@/editor/model";
import styles from "./molecules.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const keySpring = { type: "spring", visualDuration: 0.32, bounce: 0 } as const;

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

export interface SwitcherOption<T extends string> { value: T; label: string; count?: number }

/**
 * Mutually exclusive options in a well; the chosen one rises as a key and the
 * key slides between options. Used for modes, tabs and small enums.
 */
export function Switcher<T extends string>({ options, value, onChange, label, full }: { options: SwitcherOption<T>[]; value: T; onChange: (v: T) => void; label: string; full?: boolean }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={styles.switcher} data-full={full || undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={styles.switcherOption} onClick={() => onChange(o.value)}>
          {value === o.value && <motion.span layoutId={`${id}-key`} className={styles.switcherKey} transition={keySpring} />}
          <span className={styles.switcherText}>{o.label}{!!o.count && <span className={styles.count}>{o.count}</span>}</span>
        </button>
      ))}
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
              <Key size="sm" variant="secondary" onClick={stop(onApply)}>Apply</Key>
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
