import { forwardRef, useEffect } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Kbd, Key, RollText } from "@/ui/atoms";
import type { KeyProps } from "@/ui/atoms";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import { useCtaRole } from "./arbiter";
import type { CtaRole } from "./arbiter";
import { resolveLabel } from "./validate";
import type { CtaIntent, CtaRisk } from "./types";
import styles from "./cta-key.module.css";

export interface CtaKeyProps extends Omit<KeyProps, "variant" | "children"> {
  /** What kind of step this is; ranks it when several keys compete for primary. */
  intent: CtaIntent;
  /** The label the app derived from context. Always right; used when the agent's isn't. */
  label: string;
  /** The label the agent proposed. Shown when it passes the checks in validate.ts. */
  proposal?: string;
  risk?: CtaRisk;
  /** How many things the action touches; a number in the agent's label must match. */
  count?: number;
  /** Leading icon. */
  icon?: ReactNode;
  /** A key cap after the label, e.g. "⌘↵". */
  shortcut?: string;
  /** Anything else after the label, e.g. a cap that animates shut while loading. */
  trailing?: ReactNode;
  /** Why it's disabled, shown on hover and focus. */
  reason?: string;
  /** Forces a role and sits out the election, e.g. a card that's been answered. */
  role?: CtaRole;
  /** The role it takes with no CtaRegion around it. */
  fallback?: CtaRole;
}

/**
 * A key that says what it will do and takes its rank from the surface it's on.
 * The label rolls when the context changes it; the key crossfades between the
 * machined key and the light face as it gains or loses the primary.
 */
export const CtaKey = forwardRef<HTMLButtonElement, CtaKeyProps>(function CtaKey(
  { intent, label, proposal, risk, count, icon, shortcut, trailing, reason, role: forced, fallback, disabled, onClick, className, ...props },
  ref,
) {
  const resolved = resolveLabel(proposal, label, { intent, risk, count });
  // A forced role sits out the election, so a folded or decided card doesn't hold a region's primary.
  const elected = useCtaRole(intent, !disabled && !forced, fallback);
  const role = forced ?? elected;
  useEffect(() => {
    if (resolved.rejected && import.meta.env.DEV) console.warn(`[cta] "${proposal}" → "${resolved.label}": ${resolved.rejected}`);
  }, [proposal, resolved.rejected, resolved.label]);

  const key = (
    <Key ref={ref} variant={role === "primary" ? "primary" : "secondary"} data-cta="" data-role={role} data-risk={risk} data-source={resolved.source}
      aria-disabled={disabled || undefined} className={[styles.cta, className].filter(Boolean).join(" ")}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { if (disabled) { e.preventDefault(); return; } onClick?.(e); }} {...props}>
      {icon}
      <RollText text={resolved.label} className={styles.label} />
      {shortcut && <Kbd className={styles.kbd}>{shortcut}</Kbd>}
      {trailing}
    </Key>
  );
  return disabled && reason ? <Tooltip content={reason} side="top">{key}</Tooltip> : key;
});
