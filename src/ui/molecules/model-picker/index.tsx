/**
 * ModelPicker: which harness runs the agent, which model it uses, and how hard
 * it thinks.
 *
 * With `harnesses`, it's a segmented key: the left segment shows the harness's
 * mark and opens a short menu to switch between them; the right segment names
 * the model and its effort and opens the model menu. Without, it's the right
 * segment alone.
 *
 * The model menu grows out of the key's corner. Pointing at a model fills its
 * speed, quality and cost meters one cell at a time while the other rows step
 * back; the highlight glides between rows. Under the list sits the effort, a
 * step slider with a tick per level. There is no "default"
 * level: one is always picked, so you can see what the agent will do. The tray
 * at the bottom rolls to the highlighted model's first-token time and price.
 *
 * The list is a listbox driven by aria-activedescendant: focus stays on the
 * list while the arrows move the highlight.
 */
import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { Cell, Key, RollNumber, RollText, Swap } from "@/ui/atoms";
import { Slider } from "@/ui/base/slider/slider";
import { motionTokens } from "@/ui/tokens/motion";
import { ClaudeCodeIcon, CodexIcon } from "./harness-icons";
import styles from "./model-picker.module.css";

export { ClaudeCodeIcon, CodexIcon };

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

/** A thinking effort level, one of `efforts`' values. The CLI may offer more than the three defaults. */
export type Effort = string;
export interface EffortOption { value: Effort; label: string }

/** Something that runs the agent, such as Claude Code or Codex. */
export interface Harness {
  id: string;
  name: string;
  /** Its mark, drawn in currentColor. */
  icon: ReactNode;
  /** A short line under the name in the menu, e.g. why it can't run yet. */
  note?: string;
}

export const HARNESSES: Harness[] = [
  { id: "claude-code", name: "Claude Code", icon: <ClaudeCodeIcon /> },
  { id: "codex", name: "Codex", icon: <CodexIcon /> },
];

/** The models Spontaneous's agent can run on. */
export const CLAUDE_MODELS: PickerModel[] = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", short: "Opus 5.5", description: "Long videos, many notes at once", speed: 2, quality: 5, cost: 4, latencyMs: 1800, pricePerM: 20 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", short: "Sonnet 5.5", description: "Everyday edits", speed: 4, quality: 4, cost: 2, latencyMs: 800, pricePerM: 10 },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", short: "Haiku 5.5", description: "Quick trims and single zooms", speed: 5, quality: 3, cost: 1, latencyMs: 350, pricePerM: 0.5 },
];

const EFFORTS: EffortOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const rated = (m: PickerModel) => m.speed !== undefined || m.quality !== undefined || m.cost !== undefined;
const seconds = (tenths: number) => `${(tenths / 10).toFixed(1)}s`;
const dollars = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

export interface ModelPickerProps {
  /** Harnesses to switch between in a left segment. Leave out for the model key alone. */
  harnesses?: Harness[];
  /** Id of the chosen harness (controlled). */
  harness?: string;
  /** Chosen harness when uncontrolled. Default: the first. */
  defaultHarness?: string;
  /** Called with the picked harness's id. */
  onHarnessChange?: (id: string) => void;
  /** The models. Default: the three current Claude models. */
  models?: PickerModel[];
  /** Id of the chosen model (controlled). */
  value?: string;
  /** Chosen model when uncontrolled. Default: the first. */
  defaultValue?: string;
  /** Called with the picked model's id. */
  onChange?: (id: string) => void;
  /** The effort levels to offer, lowest first, as the CLI names them. Defaults to low, medium and high. Empty hides the effort. */
  efforts?: EffortOption[];
  /** Thinking effort (controlled). */
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

/**
 * The effort as a step slider: one tick per level the model offers, the thumb
 * snapping between them, the level's name as the readout. It's the app's own
 * slider, so it drags, springs and answers keys like the ones in the inspector.
 */
function EffortSlider({ efforts, value, onChange }: { efforts: EffortOption[]; value: Effort; onChange: (e: Effort) => void }) {
  const index = Math.max(0, efforts.findIndex((o) => o.value === value));
  const last = efforts.length - 1;
  return (
    <div className={styles.effort}>
      <Slider label="Effort" min={0} max={Math.max(1, last)} step={1} largeStep={1} value={index}
        marks={efforts.map((_, i) => i)} format={(i) => efforts[Math.round(i)]?.label ?? ""} disabled={last < 1}
        onValueChange={(i) => { const next = efforts[Math.round(i)]; if (next && next.value !== value) onChange(next.value); }} />
    </div>
  );
}

export function ModelPicker({
  harnesses, harness, defaultHarness, onHarnessChange,
  models = CLAUDE_MODELS, value, defaultValue, onChange,
  effort, defaultEffort = "medium", onEffortChange, efforts = EFFORTS, open, defaultOpen = false, onOpenChange, side = "bottom", align = "start", className,
}: ModelPickerProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const list = models.length ? models : CLAUDE_MODELS;
  const listRef = useRef<HTMLUListElement>(null);

  const [harnessState, setHarnessState] = useState(() => defaultHarness ?? harnesses?.[0]?.id);
  const currentHarness = harnesses?.find((h) => h.id === (harness ?? harnessState)) ?? harnesses?.[0];
  const pickHarness = (id: string) => {
    if (harness === undefined) setHarnessState(id);
    if (id !== currentHarness?.id) onHarnessChange?.(id);
  };

  const [valueState, setValueState] = useState(() => defaultValue ?? list[0]!.id);
  const chosenIndex = Math.max(0, list.findIndex((m) => m.id === (value ?? valueState)));
  const chosen = list[chosenIndex]!;
  const [effortState, setEffortState] = useState<Effort>(defaultEffort);
  // An effort the list doesn't offer shows as the nearest it does: the first.
  const currentEffort = efforts.some((o) => o.value === (effort ?? effortState)) ? (effort ?? effortState) : efforts[0]?.value ?? "";
  const effortName = efforts.find((o) => o.value === currentEffort)?.label;
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
  // Meters and the cost tray only show when some model has numbers for them; a column of "Varies" says nothing.
  const anyRated = list.some(rated);
  const anyCost = list.some((m) => m.latencyMs !== undefined || m.pricePerM !== undefined);

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

  const spoken = (m: PickerModel) => [
    m.description,
    rated(m) ? `speed ${m.speed ?? 0} of 5, quality ${m.quality ?? 0} of 5, cost ${m.cost ?? 0} of 5` : anyRated ? "speed and cost vary" : null,
    m.latencyMs !== undefined ? `first token in ${(m.latencyMs / 1000).toFixed(1)} seconds` : null,
    m.pricePerM !== undefined ? `${dollars(Math.round(m.pricePerM * 100))} per million output tokens` : null,
  ].filter(Boolean).join(", ");

  const picker = (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Key variant="tertiary" size="sm" className={cx(styles.trigger, !harnesses && className)}
          aria-label={`Model: ${chosen.name}${effortName ? `, ${effortName.toLowerCase()} effort` : ""}`}
          onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
          <RollText text={chosen.short ?? chosen.name} className={styles.triggerName} />
          {effortName && <RollText text={effortName} className={styles.triggerEffort} />}
          <ChevronDown className={styles.triggerChevron} aria-hidden />
        </Key>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.menu} data-plain={!anyRated || undefined} side={side} align={align} sideOffset={6} collisionPadding={8}
          onOpenAutoFocus={(e) => { e.preventDefault(); listRef.current?.focus({ preventScroll: true }); }}>
          <div className={styles.legend} aria-hidden>
            <span>Model</span>{anyRated && <><span>Speed</span><span>Quality</span><span>Cost</span></>}
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
                ) : anyRated && <span className={styles.varies} aria-hidden>Varies</span>}
                <span className={styles.optCheck} aria-hidden>{m.id === chosen.id && <Check />}</span>
              </li>
            ))}
          </ul>

          {efforts.length > 0 && (
            <div className={styles.settings}>
              <EffortSlider efforts={efforts} value={currentEffort} onChange={setEffort} />
            </div>
          )}

          {anyCost && <div className={styles.tray} aria-hidden>
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
          </div>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  if (!harnesses?.length || !currentHarness) return picker;
  return (
    <span role="group" aria-label="Agent" className={cx(styles.group, className)}>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Key variant="tertiary" size="sm" className={styles.harnessKey} aria-label={`Harness: ${currentHarness.name}`}>
            <span className={styles.harnessIcon}>{currentHarness.icon}</span>
            <ChevronDown className={styles.triggerChevron} aria-hidden />
          </Key>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className={styles.harnessMenu} side={side} align="start" sideOffset={6} collisionPadding={8}>
            <Menu.RadioGroup value={currentHarness.id} onValueChange={pickHarness}>
              {harnesses.map((h) => (
                <Menu.RadioItem key={h.id} value={h.id} className={styles.harnessItem}>
                  <span className={styles.harnessIcon}>{h.icon}</span>
                  <span className={styles.optText}>
                    <span className={styles.optName}>{h.name}</span>
                    {h.note && <span className={styles.optDesc}>{h.note}</span>}
                  </span>
                  <Menu.ItemIndicator className={styles.optCheck}><Check /></Menu.ItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <span className={styles.groupRule} aria-hidden />
      {picker}
    </span>
  );
}
