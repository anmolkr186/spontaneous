import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import { formatTime } from "@/editor/model";
import styles from "./atoms.module.css";

export { SpontaneousMark as Mark } from "@/ui/brand/SpontaneousMark";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────────────────────── Key ───────────────────────── */

/**
 * Button hierarchy. One primary per surface; secondary for the other real
 * actions; tertiary for quiet, reversible or escape actions.
 *   primary    the light face cell from the mark
 *   secondary  a dark machined key
 *   tertiary   no material until hovered
 */
export type KeyVariant = "primary" | "secondary" | "tertiary";
export type KeySize = "sm" | "md" | "lg";

export interface KeyProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KeyVariant;
  size?: KeySize;
  pressed?: boolean;
}

export const Key = forwardRef<HTMLButtonElement, KeyProps>(function Key(
  { variant = "secondary", size = "md", pressed, className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} data-variant={variant} data-size={size} aria-pressed={pressed} className={cx(styles.key, className)} {...props} />;
});

export interface IconKeyProps extends KeyProps {
  /** Accessible name and tooltip. */
  label: string;
  shortcut?: string;
  tooltip?: "top" | "bottom" | "left" | "right" | false;
}

/** An icon-only key. The label is required and doubles as the tooltip. */
export const IconKey = forwardRef<HTMLButtonElement, IconKeyProps>(function IconKey(
  { label, shortcut, tooltip = "bottom", variant = "tertiary", ...props },
  ref,
) {
  const key = <Key ref={ref} variant={variant} data-icon-only="" aria-label={label} {...props} />;
  if (!tooltip) return key;
  return <Tooltip side={tooltip} content={label} shortcut={shortcut}>{key}</Tooltip>;
});

/* ───────────────────────── Small text atoms ───────────────────────── */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx(styles.kbd, className)}>{children}</kbd>;
}

export function Label({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(styles.label, className)} {...props}>{children}</span>;
}

/** Monospaced, tabular time. The only place the mono face is used. */
export function Timecode({ value, frames, fps, muted, className }: { value: number; frames?: boolean; fps?: number; muted?: boolean; className?: string }) {
  return <span className={cx(styles.timecode, className)} data-muted={muted || undefined}>{formatTime(value, frames, fps)}</span>;
}

export type TagTone = "neutral" | "ink" | "rec";

/** A quiet inset label. Neutral by default; `ink` only for things you marked, `rec` only for recording. */
export function Tag({ tone = "neutral", size = "md", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone; size?: "sm" | "md" }) {
  return <span data-tone={tone} data-size={size} className={cx(styles.tag, className)} {...props} />;
}

/* ───────────────────────── Cell ───────────────────────── */

export type CellVariant = "solid" | "hollow" | "ink" | "rec" | "muted";

/** The mark's skewed cell, used as the marker shape across the app. */
export function Cell({ variant = "solid", size = 7, className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: CellVariant; size?: number }) {
  return <span aria-hidden data-variant={variant} className={cx(styles.cell, className)} style={{ ["--s" as string]: `${size}px` }} {...props} />;
}

/** A live level meter. Inherits color. */
export function Meter({ bars = 16, className }: { bars?: number; className?: string }) {
  return (
    <span className={cx(styles.meter, className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 900}ms` }} />)}
    </span>
  );
}
