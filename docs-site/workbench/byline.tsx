/**
 * Workbench: how an agent card hangs under the agent's byline.
 *
 * Today four left edges sit a few pixels apart: the mark (0), the card's
 * nodes (~11), the tray header icon (13) and the name (20). Each variant first
 * puts the card's content on the header's inset (13px from the tray edge), then
 * settles the byline against the tray a different way. Guides show the edges.
 */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GitCommitVertical } from "lucide-react";
import { Cell, Mark } from "@/ui/atoms";
import { Switch } from "@/ui/base/switch/switch";
import { Tray } from "@/ui/molecules/tray";
import styles from "./byline.module.css";

const ROWS = [
  { title: "Read the notes", edits: 0, at: "0:04" },
  { title: "Applied note 1", edits: 2, at: "0:21" },
  { title: "Cut dead air", edits: 1, at: "0:38" },
  { title: "Zoom on Create", edits: 2, at: "0:52" },
];

/** Mark 14 + gap 6: where the name starts. */
const NAME_X = 20;
/** Tray pad 3 + header pad 10: where the tray's header icon and the card's content start. */
const INSET = 13;

function Byline({ style }: { style?: CSSProperties }) {
  return <div className={styles.byline} style={style}><Mark size={14} title="" /><span>Spontaneous</span></div>;
}

function Card({ merged }: { merged?: boolean }) {
  return (
    <Tray
      fluid
      title={merged
        ? <><Mark size={14} title="" /><span className={styles.agent}>Spontaneous</span><span className={styles.sep}>Checkpoints</span><span className={styles.task}>Tighten the Projects walkthrough</span></>
        : <><GitCommitVertical /><span>Checkpoints</span><span className={styles.task}>Tighten the Projects walkthrough</span></>}
      meta={<span>4 saved</span>}
      foot={<span>5 edits on this version</span>}
    >
      <ol className={styles.rows}>
        {ROWS.map((r, i) => (
          <li key={r.title} className={styles.row} data-head={i === ROWS.length - 1 || undefined}>
            <span className={styles.node}><Cell size={9} variant={i === ROWS.length - 1 ? "solid" : "muted"} /></span>
            <span className={styles.title}>{r.title}</span>
            <span className={styles.edits}>{r.edits} {r.edits === 1 ? "edit" : "edits"}</span>
            <span className={styles.at}>{r.at}</span>
          </li>
        ))}
      </ol>
    </Tray>
  );
}

interface Variant { id: string; name: string; summary: string; guides: { x: number; label: string }[]; render: () => ReactNode }

const VARIANTS: Variant[] = [
  {
    id: "hang",
    name: "1 · Hanging tray",
    summary: "The tray steps out 13px into the gutter, so the header icon sits under the mark and the header text under the name. One edge for every icon, one for every word. The tray's frame becomes a quiet margin, like a hanging punctuation.",
    guides: [{ x: 0, label: "icons" }, { x: NAME_X, label: "text" }],
    render: () => <><Byline /><div style={{ marginLeft: -INSET }}><Card /></div></>,
  },
  {
    id: "column",
    name: "2 · Name column",
    summary: "Everything the agent says sits in the column that starts at its name; the mark hangs alone in a 20px gutter, like an avatar. The tray edge lines up with the S of Spontaneous. Its replies, cards and text all share that one edge.",
    guides: [{ x: 0, label: "mark" }, { x: NAME_X, label: "agent column" }],
    render: () => <><Byline /><div style={{ marginLeft: NAME_X }}><Card /></div></>,
  },
  {
    id: "inset",
    name: "3 · Inset byline",
    summary: "The tray keeps the full width; the byline moves in by the tray's inset instead. The mark sits over the header icon and the name over the header text, so the byline reads as the tray's first line without the tray leaving the column.",
    guides: [{ x: 0, label: "tray" }, { x: INSET, label: "icons" }, { x: INSET + NAME_X, label: "text" }],
    render: () => <><Byline style={{ paddingLeft: INSET }} /><Card /></>,
  },
  {
    id: "merged",
    name: "4 · Merged header",
    summary: "No separate byline above a card: the mark and the name lead the tray's own header, then what the card is. One line instead of two, and nothing to align. The byline stays for plain text replies.",
    guides: [{ x: 0, label: "tray" }, { x: INSET, label: "content" }],
    render: () => <Card merged />,
  },
  {
    id: "rail",
    name: "5 · Thread rail",
    summary: "A hairline drops from the mark down the gutter beside everything the agent produced in this turn, and the tray sits in the name column. The indent reads as \"this belongs to the agent\" rather than as a misalignment.",
    guides: [{ x: 7, label: "rail" }, { x: NAME_X, label: "agent column" }],
    render: () => (
      <div className={styles.railTurn}>
        <span className={styles.rail} />
        <Byline />
        <div style={{ marginLeft: NAME_X }}><Card /></div>
      </div>
    ),
  },
];

export function BylineWorkbench() {
  const [guides, setGuides] = useState(true);
  return (
    <>
      <p className={styles.lede}>
        Four left edges sit a few pixels apart today: the mark (0), the card's nodes (about 11), the tray's header icon (13) and the name (20). That near-miss is what reads as wrong.
        Every variant below first puts the card's content on the header's inset, then settles the byline a different way.
      </p>
      <label className={styles.toggle}><Switch checked={guides} onCheckedChange={setGuides} aria-label="Show guides" />Show guides</label>
      <div className={styles.grid}>
        {VARIANTS.map((v) => (
          <figure key={v.id} className={styles.variant}>
            <div className={styles.stage}>
              <div className={styles.panel}>
                <div className={styles.frame}>
                  {guides && v.guides.map((g, i) => (
                    <span key={g.label} className={styles.guide} style={{ left: g.x, "--row": i } as CSSProperties}><i>{g.label}</i></span>
                  ))}
                  <div className={styles.turn}>{v.render()}</div>
                </div>
              </div>
            </div>
            <figcaption><b>{v.name}</b>{v.summary}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
