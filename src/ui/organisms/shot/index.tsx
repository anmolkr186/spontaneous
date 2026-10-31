import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_BACKDROP, backdrop } from "@/editor/model";
import type { BackgroundId } from "@/editor/model";
import { poseAt, shotLength } from "@/editor/shots";
import type { MotionTuning, Pose, Shot } from "@/editor/shots";
import styles from "./shot.module.css";

/* ───────────────────────── Scene ───────────────────────── */

export interface ShotSceneProps {
  shot: Shot;
  pose: Pose;
  /** Defaults to the house backdrop (Hero 67). */
  background?: BackgroundId;
  /** Use the light thumbnail images: for cards, not the stage. */
  small?: boolean;
  /** The recording (or a stand-in) shown on the device screen. */
  screen: ReactNode;
  /** Extra screens for the stack and wall shots. */
  extraScreens?: ReactNode[];
}

/**
 * Renders a shot at a pose. Pure: give it a pose and it draws that frame, so
 * the stage, thumbnails and (later) export all agree.
 */
export function ShotScene({ shot, pose, background = DEFAULT_BACKDROP, small, screen, extraScreens = [] }: ShotSceneProps) {
  // Positive pitch looks down on the device, so the device tips toward the camera.
  // Positive yaw looks from the device's right, so it turns to face frame right.
  const rig: CSSProperties = {
    transform: `translate(${pose.x}cqw, ${pose.y}cqh) scale(${pose.zoom}) rotateX(${-pose.pitch}deg) rotateY(${pose.yaw}deg)`,
  };
  return (
    <div className={styles.scene}>
      <div className={styles.backdrop} style={{ background: small ? backdrop(background).thumb : backdrop(background).css }} />
      <div className={styles.rig} style={rig}>
        <div className={styles.preserve} style={{ transform: `translateY(${pose.rise}cqh)` }}>
          <Device shot={shot} pose={pose} screen={screen} extraScreens={extraScreens} />
        </div>
      </div>
    </div>
  );
}

/**
 * A solid with six faces. The front face sits at z = 0 and the box extends
 * back by `--d`. Faces cull their backs, so no face needs depth sorting.
 */
function Box({ className, style, children, back, top }: { className: string; style?: CSSProperties; children?: ReactNode; back?: ReactNode; top?: ReactNode }) {
  return (
    <div className={`${styles.box} ${className}`} style={style}>
      <div className={styles.front}>{children}</div>
      <div className={styles.back}>{back}</div>
      <div className={styles.top}>{top}</div>
      <div className={styles.bottom} />
      <div className={styles.left} />
      <div className={styles.right} />
    </div>
  );
}

function Device({ shot, pose, screen, extraScreens }: { shot: Shot; pose: Pose; screen: ReactNode; extraScreens: ReactNode[] }) {
  switch (shot.device) {
    case "macbook":
      return (
        <div className={styles.mac}>
          <Box className={styles.base} top={<Deck />}>
            <span className={styles.scoop} />
          </Box>
          <div className={styles.macShadow} />
          <div className={styles.macContact} />
          <Box className={styles.lid} style={{ transform: `rotateX(${pose.lid - 90}deg)` }} back={<span className={styles.emboss} />}>
            <div className={styles.screen} style={{ opacity: Math.min(1, Math.max(0, (pose.lid - 80) / 20)) }}>
              {screen}
              <span className={styles.notch} />
              <span className={styles.glare} />
            </div>
          </Box>
        </div>
      );
    case "display":
      return (
        <div className={styles.display}>
          {shot.id === "monolith-rise" && <Box className={styles.plinth} />}
          <div className={styles.displayShadow} />
          <div className={styles.displayContact} />
          <Box className={styles.foot} />
          <Box className={styles.neck} />
          <Box className={styles.panel} back={<span className={styles.emboss} />}>
            <div className={styles.screen}>{screen}<span className={styles.glare} /></div>
          </Box>
        </div>
      );
    case "tile":
      return (
        <Box className={styles.tile} style={{ transform: `rotateX(${pose.settle * 12}deg) rotateY(${pose.settle * -18}deg)` }}>
          {screen}<span className={styles.glare} />
        </Box>
      );
    case "stack": {
      const screens = [screen, ...extraScreens].slice(0, 3);
      while (screens.length < 3) screens.push(screen);
      return (
        <div className={styles.stack}>
          {screens.map((s, i) => {
            // Depth from the front: the front card is `pose.index`, later ones fan back.
            const d = (((i - pose.index) % 3) + 3) % 3;
            return (
              <Box key={i} className={styles.tile} style={{ transform: `translate3d(${d * 7}cqw, ${d * -5}cqh, ${d * -9}cqw) rotateZ(${d * 2.5}deg)`, "--dim": d * 0.2 } as CSSProperties}>
                {s}<span className={styles.glare} /><span className={styles.dim} />
              </Box>
            );
          })}
        </div>
      );
    }
    case "wall": {
      const cells = Array.from({ length: 15 }, (_, i) => (i === 7 ? screen : extraScreens[i % Math.max(1, extraScreens.length)] ?? screen));
      return <div className={styles.wall}>{cells.map((c, i) => <Box key={i} className={styles.tile}>{c}</Box>)}</div>;
    }
    default:
      return (
        <div className={styles.flat} data-chrome={shot.device === "browser" || undefined}>
          {shot.device === "browser" && <div className={styles.flatBar}><span className={styles.lights}><i /><i /><i /></span><b /></div>}
          <div className={styles.flatBody}>{screen}</div>
        </div>
      );
  }
}

/** The keyboard deck, drawn on the top face of the base. */
function Deck() {
  return (
    <>
      <span className={styles.hinge} />
      <span className={styles.grille} data-side="l" />
      <span className={styles.keys} />
      <span className={styles.grille} data-side="r" />
      <span className={styles.pad} />
    </>
  );
}

/* ───────────────────────── Stand-in screen ───────────────────────── */

/** Colours for the stage inside the stand-in screen: soft glows on a deep base. */
const TONES = {
  tangerine: "radial-gradient(70% 80% at 85% 15%, #ffb36b 0%, transparent 60%), radial-gradient(80% 90% at 10% 100%, #ff5a2a 0%, transparent 65%), linear-gradient(160deg, #ff8a3d 0%, #c2410c 100%)",
  cobalt: "radial-gradient(70% 70% at 80% 10%, #5fd4ff 0%, transparent 60%), radial-gradient(90% 90% at 0% 100%, #1238ff 0%, transparent 70%), linear-gradient(160deg, #2b6bff 0%, #0b1f8c 100%)",
  orchid: "radial-gradient(70% 70% at 15% 10%, #ff9ad5 0%, transparent 60%), radial-gradient(80% 80% at 100% 100%, #7b2ff7 0%, transparent 65%), linear-gradient(160deg, #e0479e 0%, #6a1b9a 100%)",
  citrus: "radial-gradient(70% 80% at 85% 10%, #f3ff6b 0%, transparent 60%), radial-gradient(90% 90% at 0% 100%, #11b36b 0%, transparent 65%), linear-gradient(160deg, #a6e83a 0%, #0f7a4a 100%)",
  sunset: "radial-gradient(80% 80% at 20% 0%, #ffd27a 0%, transparent 60%), radial-gradient(80% 90% at 100% 100%, #ff3d6e 0%, transparent 65%), linear-gradient(170deg, #ff8a5c 0%, #b8235a 100%)",
  lagoon: "radial-gradient(70% 70% at 80% 0%, #7ff5d9 0%, transparent 60%), radial-gradient(90% 90% at 0% 100%, #0077b6 0%, transparent 65%), linear-gradient(160deg, #19c2b0 0%, #064e6e 100%)",
  rose: "radial-gradient(70% 70% at 15% 0%, #ffffff 0%, transparent 55%), radial-gradient(80% 80% at 100% 100%, #ff9fb8 0%, transparent 60%), linear-gradient(170deg, #ffd6e0 0%, #f4a6c0 100%)",
};
export type Tone = keyof typeof TONES;

/**
 * The screen shown wherever a template plays without a clip: shot thumbnails,
 * the template preview and the docs. It is the Spontaneous editor itself, drawn
 * from the tokens, so every template previews against the same real interface.
 * `tone` is the backdrop inside its stage. No notes or ink: those only appear
 * on a clip once you leave one.
 */
export function ScreenArt({ tone = "cobalt" }: { tone?: Tone }) {
  return (
    <div className={styles.art} aria-hidden>
      <div className={styles.aBar}>
        <span className={styles.dots}><i /><i /><i /></span>
        <span className={styles.aCrumb}>Launch video</span>
        <span className={styles.aSwitch}><em data-on>Lite</em><em>Studio</em></span>
      </div>
      <div className={styles.aStage}>
        <div className={styles.aCanvas} style={{ background: TONES[tone] }}><AppWindow /></div>
      </div>
      <div className={styles.aSide}>
        <span className={styles.aSwitch} data-full><em data-on>Agent</em><em>Notes</em></span>
        <p className={styles.aMsg}>Pushed in on the chart and eased the cut to 0.8×.</p>
        <span className={styles.aTool}><i />Set zoom<b>1.6×</b></span>
        <span className={styles.aTool}><i />Set shot<b>Orbit In</b></span>
        <span className={styles.aComposer}>Ask for an edit…</span>
      </div>
      <div className={styles.aTimeline}>
        <span className={styles.aRuler}>{["0:00", "0:05", "0:10", "0:15", "0:20"].map((t) => <i key={t}>{t}</i>)}</span>
        <span className={styles.aTrack}><i className={styles.aClip}>Recording</i></span>
        <span className={styles.aTrack}><i className={styles.aZoom} style={{ left: "10%", width: "20%" }}>1.6×</i><i className={styles.aZoom} style={{ left: "48%", width: "24%" }}>1.4×</i></span>
        <span className={styles.aPlayhead} />
      </div>
    </div>
  );
}

/** The light app inside the stage: what a recording of someone's product looks like. */
function AppWindow() {
  return (
    <span className={styles.appWin}>
      <span className={styles.appHead}><i /><i /><i /></span>
      <span className={styles.appBody}>
        <span className={styles.appHero} />
        <span className={styles.appRow}><i /><i /><i /></span>
      </span>
    </span>
  );
}

/* ───────────────────────── Thumbnails ───────────────────────── */

interface Thumb {
  /** Colour inside the screen's stage. */
  tone: Tone;
  /** Seconds into the shot for the resting thumbnail; defaults to the end pose. */
  t?: number;
}

/** Art direction for each card: same screen everywhere, only the inner tone changes. */
const THUMBS: Record<string, Thumb> = {
  focus: { tone: "tangerine" },
  clean: { tone: "citrus" },
  tile: { tone: "orchid" },
  desk: { tone: "cobalt" },
  "lid-rise": { tone: "cobalt" },
  "orbit-in": { tone: "tangerine" },
  takeover: { tone: "citrus", t: 0.6 },
  "monolith-rise": { tone: "cobalt" },
  "pan-right": { tone: "orchid" },
  "pan-left": { tone: "lagoon" },
  "low-hero": { tone: "tangerine" },
  "top-down": { tone: "orchid" },
  "edge-glide": { tone: "rose" },
  "tile-stack": { tone: "cobalt" },
  wall: { tone: "tangerine", t: 1.3 },
};

/** The inner tone the stand-in uses for a shot, shared by its card and its preview. */
export function standInTone(shot: Shot): Tone {
  return THUMBS[shot.id]?.tone ?? "cobalt";
}

/** Tones for the extra screens in Tile Stack and Infinite Wall. */
export const EXTRA_TONES: Tone[] = ["lagoon", "orchid", "sunset", "citrus"];

/** The screen for a shot without a clip. Zoom focus shows its idea: the camera pushed in on the cursor. */
export function StandIn({ shot }: { shot: Shot }) {
  const tone = standInTone(shot);
  if (shot.id !== "focus") return <ScreenArt tone={tone} />;
  return (
    <div className={styles.focus}>
      <div className={styles.focusCam}><ScreenArt tone={tone} /></div>
      <svg className={styles.cursor} viewBox="0 0 16 22" aria-hidden><path d="M1 1v17.5l4.6-4.4 3 6.9 3.1-1.3-3-6.8H15z" /></svg>
    </div>
  );
}

/**
 * A shot in the library. The thumbnail rests on the shot's hero frame and plays
 * the shot's motion on hover, so you see the move before choosing it.
 */
export function ShotCard({ shot, selected, background, onSelect }: { shot: Shot; selected?: boolean; background?: BackgroundId; onSelect?: () => void }) {
  const [t, setT] = useState<number | null>(null);
  const frame = useRef(0);
  const length = shotLength(shot) + 0.6;
  const play = () => {
    const start = performance.now();
    const tick = (now: number) => {
      setT(((now - start) / 1000) % length);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(frame.current); setT(null); };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <button type="button" className={styles.card} aria-pressed={selected} title={shot.line} onClick={onSelect} onPointerEnter={play} onPointerLeave={stop} onFocus={play} onBlur={stop}>
      <span className={styles.thumb}>
        <ShotScene
          shot={shot}
          small
          background={background}
          pose={poseAt(shot, t ?? THUMBS[shot.id]?.t ?? shotLength(shot))}
          screen={<StandIn shot={shot} />}
          extraScreens={EXTRA_TONES.map((tone) => <ScreenArt key={tone} tone={tone} />)}
        />
      </span>
      <span className={styles.cardName}>{shot.name}</span>
    </button>
  );
}

/** Pose for a shot at a time, with tuning. Re-exported for the stage. */
export function useShotPose(shot: Shot, t: number, tuning: MotionTuning) {
  return poseAt(shot, t, tuning);
}
