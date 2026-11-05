export const motionTokens = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48, roll: 0.46, rollOut: 0.32, fold: 0.38, draw: 0.36 },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    exit: [0.7, 0, 0.84, 0],
    standard: [0.22, 1, 0.36, 1],
    /** For elements that move while already on screen. */
    inOut: [0.65, 0, 0.35, 1],
    /** Folds, sheets and version switchers: a drawer's curve. */
    glide: [0.32, 0.72, 0.24, 1],
  },
  spring: {
    responsive: { type: "spring", stiffness: 520, damping: 44 },
    gentle: { type: "spring", stiffness: 340, damping: 34 },
    /** Presses, toggles, thumbs, and small indicators. Settles fast and never overshoots, so nothing jitters. */
    snappy: { type: "spring", visualDuration: 0.26, bounce: 0 },
    /** Panels, height changes, and layout shifts. Critically damped, never overshoots. */
    smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
    /** Shape morphs, shared layout highlights, and width changes that follow new content. No bounce: sizes and positions settle without overshoot. */
    morph: { type: "spring", visualDuration: 0.42, bounce: 0 },
    /** Rows that change place (reorder, regroup, a note gliding into a step). Long enough to follow with the eye. */
    travel: { type: "spring", visualDuration: 0.56, bounce: 0 },
    /** Small marks landing: a vote, a check ring, a pin. The one place a bounce is allowed. */
    pop: { type: "spring", visualDuration: 0.36, bounce: 0.35 },
  },
  /** Stagger steps in seconds. Keep total stagger under roughly 0.4s. */
  stagger: { char: 0.016, word: 0.04, line: 0.08, item: 0.035, row: 0.06 },
  /** Blur radii in px for text and content crossfades. Keep blur small and brief. */
  blur: { subtle: 2, soft: 4, text: 8, roll: 3 },
} as const;

/**
 * Motion presets for content arriving and leaving. Things never appear hard:
 * they rise a few pixels out of a small blur and settle; they leave into one.
 * Use with motion components: `<motion.div {...blurIn} />`.
 */
export const blurIn = {
  initial: { opacity: 0, y: 3, filter: `blur(${motionTokens.blur.subtle}px)` },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -2, filter: `blur(${motionTokens.blur.subtle}px)` },
  transition: { duration: motionTokens.duration.standard, ease: motionTokens.ease.standard },
} as const;
