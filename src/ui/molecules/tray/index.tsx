import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./tray.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface TrayProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Left of the header row: what this is ("Plan · 5 steps"). Quiet, small. */
  title?: ReactNode;
  /** Right of the header row: counts, clocks, cost. */
  meta?: ReactNode;
  /** The footer row under the card: status on the left, actions on the right. */
  foot?: ReactNode;
  /** Put children straight in the tray instead of one card, e.g. several cards or a resolved row. */
  bare?: boolean;
  /** Stretch to the container instead of the default 400px measure. */
  fluid?: boolean;
}

/**
 * The shell agent components live in: a raised card sitting in a shallow tray.
 * The card holds the content; the tray's header and footer rows hold the meta
 * and the actions, so the card itself stays calm. Radii are concentric: the
 * card is the tray's radius minus its padding.
 *
 * Under the agent's byline a tray hangs: it steps out by --tray-inset so its
 * header icon sits under the mark and its header text under the name.
 */
export const Tray = forwardRef<HTMLElement, TrayProps>(function Tray({ title, meta, foot, bare, fluid, children, className, ...props }, ref) {
  return (
    <section ref={ref} className={cx(styles.tray, className)} data-tray="" data-fluid={fluid || undefined} {...props}>
      {(title || meta) && (
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          {meta && <span className={styles.meta}>{meta}</span>}
        </div>
      )}
      {bare ? children : <div className={styles.card}>{children}</div>}
      {foot && <div className={styles.foot}>{foot}</div>}
    </section>
  );
});

/** A raised card for use inside a `bare` tray, or on its own. */
export function TrayCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.card, className)} {...props} />;
}

/** A row in the tray's own material: a header or footer line between cards. */
export function TrayRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.foot, className)} {...props} />;
}

/** Pushes the following footer items to the right. */
export function TraySpacer() {
  return <span className={styles.spacer} />;
}

export { styles as trayStyles };
