/**
 * ShotSuggestion: the agent suggests one choice and leaves a way out.
 *
 * Reads as one sentence in the card ("Use Orbit In for the opening"), the
 * reason folded under it, and the tray's footer: how sure the agent is (three
 * skewed cells and the word), Other options, and Accept. Picking another
 * option rolls the name in the sentence and swaps the reason softly. Accepting
 * folds the reason away and turns the footer into "Using Orbit In" with an Undo
 * that stays for a few seconds.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Film } from "lucide-react";
import { Cell, DrawCheck, Fold, Key, RollText, Swap, Tag } from "@/ui/atoms";
import { AutoHeight } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import { CtaKey, proposedPrimary, shotLabel } from "@/ui/cta";
import type { CtaProposal } from "@/ui/cta";
import styles from "./shot-suggestion.module.css";

export type Confidence = 1 | 2 | 3;

export interface ShotOption {
  id: string;
  /** The shot's name as the library shows it: "Orbit In". */
  label: string;
  /** One or two sentences on why, in the project's terms. */
  reason: ReactNode;
  /** How sure the agent is: 1 low, 2 medium, 3 high. */
  confidence: Confidence;
}

export interface ShotSuggestionProps {
  /** The first is the suggestion; the rest are offered under Other options. */
  options: ShotOption[];
  /** Where the shot goes, finishing the sentence "Use Orbit In …": "for the opening". */
  context?: string;
  /** Tray title. */
  title?: ReactNode;
  /** Right of the tray title, e.g. the range the shot covers. */
  meta?: ReactNode;
  /** Id of the option shown, controlled. Pair with `onPick`. */
  value?: string;
  /** Id of the option shown first when uncontrolled. Defaults to the suggestion. */
  defaultValue?: string;
  /** Start with the reason unfolded. */
  defaultOpen?: boolean;
  /** Another option was picked from the menu. */
  onPick?: (option: ShotOption) => void;
  /** The shown option was accepted. */
  onAccept?: (option: ShotOption) => void;
  /** An accept was undone. */
  onUndo?: (option: ShotOption) => void;
  /** How long Undo stays after accepting, in ms. */
  undoFor?: number;
  /** Labels the agent proposed for the main key. Shown when they pass the checks; otherwise the derived label. */
  cta?: CtaProposal;
  className?: string;
}

const WORD: Record<Confidence, string> = { 1: "Low", 2: "Medium", 3: "High" };
const level = (n: number): Confidence => (n >= 3 ? 3 : n <= 1 ? 1 : 2);

/** Three skewed cells, filled up to the level, with the level in words. */
function ConfidenceCells({ value, word }: { value: Confidence; word?: boolean }) {
  return (
    <span className={styles.confidence} data-level={value}>
      <span className={styles.cells} aria-hidden>
        {[1, 2, 3].map((n) => <Cell key={n} size={6} variant={value >= n ? "solid" : "muted"} />)}
      </span>
      {word ? <><RollText text={WORD[value]} className={styles.word} /><span className="visually-hidden"> confidence</span></> : <span className="visually-hidden">{WORD[value]} confidence</span>}
    </span>
  );
}

export function ShotSuggestion({
  options,
  context,
  title = <><Film />Suggested shot</>,
  meta,
  value,
  defaultValue,
  defaultOpen = true,
  onPick,
  onAccept,
  onUndo,
  undoFor = 5000,
  cta,
  className,
}: ShotSuggestionProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [index, setIndex] = useState(() => Math.max(0, options.findIndex((o) => o.id === defaultValue)));
  const [open, setOpen] = useState(defaultOpen);
  const [accepted, setAccepted] = useState(false);
  const [undoable, setUndoable] = useState(false);
  const [said, setSaid] = useState("");
  const acceptKey = useRef<HTMLButtonElement>(null);
  const undoKey = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    if (!accepted) return;
    setUndoable(true);
    const t = window.setTimeout(() => setUndoable(false), undoFor);
    return () => window.clearTimeout(t);
  }, [accepted, undoFor]);

  // The key you pressed swaps away, so focus moves to the one that replaced it.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (accepted ? undoKey : acceptKey).current?.focus();
  }, [accepted]);

  const shown = value !== undefined ? options.findIndex((o) => o.id === value) : index;
  const at = shown >= 0 && shown < options.length ? shown : 0;
  const current = options[at];
  if (!current) return null;
  const suggested = at === 0;

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (value === undefined) setIndex(i);
    setOpen(true);
    if (i !== at) onPick?.(o);
  };
  const accept = () => {
    refocus.current = true;
    setAccepted(true);
    setSaid(`Using ${current.label}`);
    onAccept?.(current);
  };
  const undo = () => {
    refocus.current = true;
    setAccepted(false);
    setSaid(`Undone. ${current.label} is still suggested.`);
    onUndo?.(current);
  };

  const foot = (
    <Swap id={accepted ? "accepted" : "choose"} className={styles.foot}>
      {accepted ? (
        <>
          <span className={styles.using}><DrawCheck size={13} className={styles.check} />Using {current.label}</span>
          <TraySpacer />
          <AnimatePresence initial={false}>
            {undoable && (
              <motion.span key="undo" {...blurIn} transition={reduce ? { duration: 0 } : blurIn.transition}>
                <Key ref={undoKey} size="sm" variant="tertiary" onClick={undo}>Undo</Key>
              </motion.span>
            )}
          </AnimatePresence>
        </>
      ) : (
        <>
          <ConfidenceCells value={level(current.confidence)} word />
          <TraySpacer />
          {options.length > 1 && <OptionsMenu options={options} value={at} onPick={pick} />}
          <CtaKey ref={acceptKey} size="sm" intent="apply" label={shotLabel(current.label)} proposal={at === 0 ? proposedPrimary(cta, "apply") : undefined} onClick={accept} />
        </>
      )}
    </Swap>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Tray className={[styles.root, className].filter(Boolean).join(" ")} aria-label="Shot suggestion" title={title} meta={meta} foot={foot} data-accepted={accepted || undefined}>
        <button type="button" className={styles.head} aria-expanded={open && !accepted} aria-controls={`${id}-reason`} disabled={accepted} onClick={() => setOpen(!open)}>
          <span className={styles.headline}>
            <span>Use</span>
            <RollText text={current.label} className={styles.name} />
            {context && <span className={styles.context}>{context}</span>}
          </span>
          <AnimatePresence initial={false}>
            {!suggested && !accepted && (
              <motion.span key="alt" className={styles.alt} {...blurIn} transition={reduce ? { duration: 0 } : blurIn.transition}>
                <Tag size="sm">Alternative</Tag>
              </motion.span>
            )}
          </AnimatePresence>
          {!accepted && <ChevronDown className={styles.chevron} aria-hidden />}
        </button>
        <Fold open={open && !accepted} id={`${id}-reason`}>
          <AutoHeight>
            <div className={styles.reason}>
              <Swap id={current.id} inline={false}>{current.reason}</Swap>
            </div>
          </AutoHeight>
        </Fold>
      </Tray>
      <span className="visually-hidden" role="status" aria-live="polite">{said}</span>
    </MotionConfig>
  );
}

/* ───────────────────────── Other options ───────────────────────── */

/**
 * A small menu of the options as radio items. Opens above its key, with focus
 * on the shown option; a light fill glides under the pointer or focus.
 */
function OptionsMenu({ options, value, onPick }: { options: ShotOption[]; value: number; onPick: (i: number) => void }) {
  const reduce = useReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(value);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    setHi(value);
    items.current[value]?.focus();
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open, value]);

  const move = (to: number) => {
    const n = options.length;
    const i = ((to % n) + n) % n;
    setHi(i);
    items.current[i]?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(hi + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(hi - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(options.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <span ref={wrap} className={styles.menuWrap}>
      <Key ref={trigger} size="sm" variant="tertiary" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
        Other options<ChevronDown className={styles.menuChevron} data-open={open || undefined} />
      </Key>
      <AnimatePresence>
        {open && (
          <motion.div
            id={`${id}-menu`}
            role="menu"
            aria-label="Shots"
            className={styles.menu}
            onKeyDown={onKey}
            initial={{ opacity: 0, y: 4, scale: 0.98, filter: `blur(${motionTokens.blur.subtle}px)` }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 2, scale: 0.99, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: reduce ? 0 : motionTokens.duration.exit, ease: motionTokens.ease.standard } }}
            transition={reduce ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: motionTokens.ease.enter }}
          >
            {options.map((o, i) => (
              <button
                key={o.id}
                ref={(el) => { items.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={i === value}
                tabIndex={i === hi ? 0 : -1}
                className={styles.option}
                onPointerEnter={() => setHi(i)}
                onFocus={() => setHi(i)}
                onClick={() => { onPick(i); close(true); }}
              >
                {i === hi && <motion.span layoutId={`${id}-hi`} className={styles.optionHi} transition={reduce ? { duration: 0 } : motionTokens.spring.snappy} />}
                <span className={styles.optionCheck}>{i === value && <Check aria-hidden />}</span>
                <span className={styles.optionName}>{o.label}</span>
                {i === 0 && <Tag size="sm">Suggested</Tag>}
                <ConfidenceCells value={level(o.confidence)} />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
