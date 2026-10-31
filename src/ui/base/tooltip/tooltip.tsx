import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import styles from "./tooltip.module.css";

/**
 * Tooltip variants (pick by content, never by look):
 *   label     one short line naming the control. Default.
 *   shortcut  the label plus its key caps. Use when the control has a shortcut.
 *   hint      a title plus one line of why/how. Use for disabled reasons and first-run hints.
 */
export type TooltipVariant = "label" | "shortcut" | "hint";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  /** Key caps, e.g. "⌘Z" or "⇧⌘R". Switches to the shortcut variant. */
  shortcut?: string;
  /** A second line. Switches to the hint variant. */
  description?: ReactNode;
}

/** Wait before the first tooltip; once one has shown, neighbours open instantly. */
const DELAY = 450;
const SKIP_WINDOW = 400;

let warm = false;
let openCount = 0;
let coolTimer = 0;
const listeners = new Set<() => void>();
const warmth = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => warm,
  set(next: boolean) { if (warm === next) return; warm = next; listeners.forEach((l) => l()); },
  opened() { openCount += 1; window.clearTimeout(coolTimer); warmth.set(true); },
  closed() { openCount = Math.max(0, openCount - 1); if (openCount) return; window.clearTimeout(coolTimer); coolTimer = window.setTimeout(() => warmth.set(false), SKIP_WINDOW); },
};

/** Splits "⇧⌘Z" into caps: ⇧ ⌘ Z. */
function caps(shortcut: string) {
  return shortcut.replace(/\s+/g, "").match(/[⌘⇧⌥⌃↵⌫⎋]|[A-Za-z0-9]+|./g) ?? [shortcut];
}

export function Tooltip({ content, children, side = "top", shortcut, description }: TooltipProps) {
  const isWarm = useSyncExternalStore(warmth.subscribe, warmth.get, () => false);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  useEffect(() => {
    if (!open) return;
    warmth.opened();
    return warmth.closed;
  }, [open]);
  const variant: TooltipVariant = description ? "hint" : shortcut ? "shortcut" : "label";
  return (
    <TooltipPrimitive.Provider delayDuration={DELAY} skipDelayDuration={0}>
      <TooltipPrimitive.Root open={open} delayDuration={isWarm ? 0 : DELAY} onOpenChange={(next) => { if (next) setInstant(warmth.get()); setOpen(next); }}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className={styles.tooltip} data-variant={variant} data-instant={instant || undefined} side={side} sideOffset={6} collisionPadding={8}>
            {variant === "hint" ? (
              <>
                <span className={styles.title}>{content}{shortcut && <span className={styles.caps}>{caps(shortcut).map((c, i) => <kbd key={i}>{c}</kbd>)}</span>}</span>
                <span className={styles.description}>{description}</span>
              </>
            ) : (
              <>
                {content}
                {shortcut && <span className={styles.caps}>{caps(shortcut).map((c, i) => <kbd key={i}>{c}</kbd>)}</span>}
              </>
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/** The tooltip bubble without its trigger, for documenting variants. */
export function TooltipPreview({ content, shortcut, description }: Omit<TooltipProps, "children" | "side">) {
  const variant: TooltipVariant = description ? "hint" : shortcut ? "shortcut" : "label";
  return (
    <span className={styles.tooltip} data-variant={variant} style={{ position: "relative" }}>
      {variant === "hint" ? (
        <>
          <span className={styles.title}>{content}</span>
          <span className={styles.description}>{description}</span>
        </>
      ) : (
        <>{content}{shortcut && <span className={styles.caps}>{caps(shortcut).map((c, i) => <kbd key={i}>{c}</kbd>)}</span>}</>
      )}
    </span>
  );
}

export default Tooltip;
