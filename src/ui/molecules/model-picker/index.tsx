/**
 * ModelPicker: which model the agent edits with, and whether it thinks first.
 *
 * A quiet key names the model; a small bulb unfolds beside the name while
 * extended thinking is on. It opens a menu that grows out of the key's corner.
 * Pointing at a model fills its speed, quality and cost meters one cell at a
 * time while the other rows step back; the highlight glides between rows.
 * Under the list sit the thinking switch and, when it's on, the effort. The
 * tray at the bottom rolls to the highlighted model's first-token time and
 * price, so the cost of a choice shows before you make it.
 *
 * The list is a listbox driven by aria-activedescendant: focus stays on the
 * list while the arrows move the highlight.
 */
import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Lightbulb } from "lucide-react";
import { Cell, Fold, Key, RollNumber, RollText, Swap } from "@/ui/atoms";
import { Switcher } from "@/ui/molecules";
import { Switch } from "@/ui/base/switch/switch";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./model-picker.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface PickerModel {
  id: string;
  /** Full name in the menu: "Claude Sonnet 5.5". */
  name: string;
  /** Shorter name for the trigger: "Sonnet 5.5". Falls back to `name`. */
  short?: string;
  /** What it's good at, in a few words. */
  description?: string;
  /** Strengths from 1 to 5. Leave all three out for a router like Auto: the row says "Varies". */
  speed?: number;
  quality?: number;
  /** 5 is the most expensive. */
  cost?: number;
  /** Typical time to the first token, in ms. */
  latencyMs?: number;
  /** Dollars per million output tokens. */
  pricePerM?: number;
}

export type Effort = "low" | "medium" | "high";

/** The models Spontaneous's agent can run on. Auto picks per edit. */
export const CLAUDE_MODELS: PickerModel[] = [
  { id: "auto", name: "Auto", description: "Picks a model for each edit" },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", short: "Opus 5.5", description: "Long videos, many notes at once", speed: 2, quality: 5, cost: 4, latencyMs: 1800, pricePerM: 20 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", short: "Sonnet 5.5", description: "Everyday edits", speed: 4, quality: 4, cost: 2, latencyMs: 800, pricePerM: 10 },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", short: "Haiku 5.5", description: "Quick trims and single zooms", speed: 5, quality: 3, cost: 1, latencyMs: 350, pricePerM: 0.5 },
];

const EFFORTS: { value: Effort; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const rated = (m: PickerModel) => m.speed !== undefined || m.quality !== undefined || m.cost !== undefined;
const seconds = (tenths: number) => `${(tenths / 10).toFixed(1)}s`;
const dollars = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

export interface ModelPickerProps {
  /** The models, Auto first. Default: Auto and the three current Claude models. */
  models?: PickerModel[];
  /** Id of the chosen model (controlled). */
  value?: string;
  /** Chosen model when uncontrolled. Default: the first. */
  defaultValue?: string;
  /** Called with the picked model's id. */
  onChange?: (id: string) => void;
  /** Extended thinking switch (controlled). */
  thinking?: boolean;
  /** Starting state of the thinking switch. */
  defaultThinking?: boolean;
  /** Called when the thinking switch flips. */
  onThinkingChange?: (on: boolean) => void;
  /** Thinking effort (controlled). The control only shows while thinking is on. */
  effort?: Effort;
  /** Starting effort. */
  defaultEffort?: Effort;
  /** Called with the new effort. */
  onEffortChange?: (effort: Effort) => void;
  /** Menu open state (controlled). */
  open?: boolean;
  /** Start open when uncontrolled. */
  defaultOpen?: boolean;
  /** Called when the menu opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Open above or below the trigger. Use "top" in a composer at the bottom of the panel. */
  side?: "top" | "bottom";
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  className?: string;
}

/** Five skewed cells; the first `value` fill, one after another, when the row is pointed at. */
function Segments({ value = 0 }: { value?: number }) {
  return (
    <span className={styles.segments}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Cell key={n} size={5} className={styles.seg} data-fill={n <= value || undefined} style={{ "--s": "5px", "--n": n } as CSSProperties} />
      ))}
    </span>
  );
}

export function ModelPicker({
  models = CLAUDE_MODELS, value, defaultValue, onChange, thinking, defaultThinking = false, onThinkingChange,
  effort, defaultEffort = "medium", onEffortChange, open, defaultOpen = false, onOpenChange, side = "bottom", align = "start", className,
}: ModelPickerProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const list = models.length ? models : CLAUDE_MODELS;
  const listRef = useRef<HTMLUListElement>(null);
  const effortRef = useRef<HTMLDivElement>(null);

  const [valueState, setValueState] = useState(() => defaultValue ?? list[0]!.id);
  const chosenIndex = Math.max(0, list.findIndex((m) => m.id === (value ?? valueState)));
  const chosen = list[chosenIndex]!;
  const [thinkingState, setThinkingState] = useState(defaultThinking);
  const isThinking = thinking ?? thinkingState;
  const [effortState, setEffortState] = useState<Effort>(defaultEffort);
  const currentEffort = effort ?? effortState;
  const [openState, setOpenState] = useState(defaultOpen);
  const isOpen = open ?? openState;

  // The highlight starts on the chosen model each time the menu opens.
  const [active, setActive] = useState(chosenIndex);
  const [pointing, setPointing] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) { setActive(chosenIndex); setPointing(false); }
  }
  const shown = list[Math.min(active, list.length - 1)]!;

  const setOpen = (next: boolean) => {
    if (open === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const pick = (i: number) => {
    const m = list[i];
    if (!m) return;
    if (value === undefined) setValueState(m.id);
    if (m.id !== chosen.id) onChange?.(m.id);
    setOpen(false);
  };
  const setThinking = (on: boolean) => {
    if (thinking === undefined) setThinkingState(on);
    onThinkingChange?.(on);
  };
  const setEffort = (e: Effort) => {
    if (effort === undefined) setEffortState(e);
    onEffortChange?.(e);
  };

  const onListKey = (e: KeyboardEvent) => {
    const last = list.length - 1;
    const move = (i: number) => { e.preventDefault(); setActive(Math.min(last, Math.max(0, i))); setPointing(true); };
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
  };

  // Effort is a radio group with arrow keys; focus follows the chosen level.
  const onEffortKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = EFFORTS.findIndex((o) => o.value === currentEffort);
    const next = EFFORTS[Math.min(EFFORTS.length - 1, Math.max(0, i + step))]!;
    setEffort(next.value);
    requestAnimationFrame(() => effortRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  const spoken = (m: PickerModel) => [
    m.description,
    rated(m) ? `speed ${m.speed ?? 0} of 5, quality ${m.quality ?? 0} of 5, cost ${m.cost ?? 0} of 5` : "speed and cost vary",
    m.latencyMs !== undefined ? `first token in ${(m.latencyMs / 1000).toFixed(1)} seconds` : null,
    m.pricePerM !== undefined ? `${dollars(Math.round(m.pricePerM * 100))} per million output tokens` : null,
  ].filter(Boolean).join(", ");

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Key variant="tertiary" size="sm" className={cx(styles.trigger, className)}
          aria-label={`Model: ${chosen.name}${isThinking ? `, extended thinking on, ${currentEffort} effort` : ""}`}
          onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
          <RollText text={chosen.short ?? chosen.name} className={styles.triggerName} />
          <span className={styles.bulb} data-on={isThinking || undefined} aria-hidden><span className={styles.bulbClip}><Lightbulb /></span></span>
          <ChevronDown className={styles.triggerChevron} aria-hidden />
        </Key>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.menu} side={side} align={align} sideOffset={6} collisionPadding={8}
          onOpenAutoFocus={(e) => { e.preventDefault(); listRef.current?.focus({ preventScroll: true }); }}>
          <div className={styles.legend} aria-hidden>
            <span>Model</span><span>Speed</span><span>Quality</span><span>Cost</span>
          </div>
          <ul ref={listRef} role="listbox" tabIndex={0} aria-label="Model" aria-activedescendant={`${uid}-opt-${active}`}
            className={styles.list} data-pointing={pointing || undefined} onKeyDown={onListKey} onPointerLeave={() => setPointing(false)}>
            {list.map((m, i) => (
              <li key={m.id} id={`${uid}-opt-${i}`} role="option" aria-selected={m.id === chosen.id} className={styles.option} data-active={i === active || undefined}
                onPointerMove={() => { if (i !== active) setActive(i); if (!pointing) setPointing(true); }} onClick={() => pick(i)}>
                {i === active && <motion.span layoutId={`${uid}-fill`} className={styles.fill} transition={reduce ? { duration: 0 } : motionTokens.spring.morph} aria-hidden />}
                <span className={styles.optText}>
                  <span className={styles.optName}>{m.name}</span>
                  {m.description && <span className={styles.optDesc} aria-hidden>{m.description}</span>}
                  <span className="visually-hidden">{spoken(m)}</span>
                </span>
                {rated(m) ? (
                  <>
                    <Segments value={m.speed} />
                    <Segments value={m.quality} />
                    <Segments value={m.cost} />
                  </>
                ) : <span className={styles.varies} aria-hidden>Varies</span>}
                <span className={styles.optCheck} aria-hidden>{m.id === chosen.id && <Check />}</span>
              </li>
            ))}
          </ul>

          <div className={styles.settings}>
            <label className={styles.setting}>
              <span className={styles.settingText}>
                <span className={styles.settingName}>Extended thinking</span>
                <span className={styles.settingHint}>Plans the edit before it makes it</span>
              </span>
              <Switch checked={isThinking} onCheckedChange={setThinking} aria-label="Extended thinking" />
            </label>
            <Fold open={isThinking}>
              <div ref={effortRef} className={styles.setting} onKeyDown={onEffortKey}>
                <span className={styles.settingName}>Effort</span>
                <Switcher label="Effort" options={EFFORTS} value={currentEffort} onChange={setEffort} />
              </div>
            </Fold>
          </div>

          <div className={styles.tray} aria-hidden>
            <span className={styles.trayItem}>
              <span className={styles.trayLabel}>First token</span>
              <Swap id={shown.latencyMs !== undefined ? "n" : "v"}>
                {shown.latencyMs !== undefined ? <RollNumber mono value={Math.round(shown.latencyMs / 100)} format={seconds} className={styles.trayValue} /> : <span className={styles.trayValue}>Varies</span>}
              </Swap>
            </span>
            <span className={styles.trayItem}>
              <Swap id={shown.pricePerM !== undefined ? "n" : "v"}>
                {shown.pricePerM !== undefined ? <RollNumber value={Math.round(shown.pricePerM * 100)} format={dollars} className={styles.trayValue} /> : <span className={styles.trayValue}>Varies</span>}
              </Swap>
              <span className={styles.trayLabel}>per M output tokens</span>
            </span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
