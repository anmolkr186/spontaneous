import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { Key, Mark, Tag } from "@/ui/atoms";
import { Switcher } from "@/ui/molecules";
import { ENTRIES, LAYERS } from "./registry";
import { DETAILS } from "./details";
import type { DocEntry } from "./registry";
import styles from "./docs.module.css";

const FOUNDATIONS = [
  { id: "introduction", name: "Introduction" },
  { id: "color", name: "Color" },
  { id: "space", name: "Space and radius" },
  { id: "materials", name: "Materials" },
  { id: "type", name: "Type" },
  { id: "motion", name: "Motion" },
  { id: "interaction", name: "Interaction" },
] as const;
type FoundationId = (typeof FOUNDATIONS)[number]["id"];

function readHash(): string {
  const id = location.hash.slice(1);
  return ENTRIES.some((e) => e.id === id) || FOUNDATIONS.some((f) => f.id === id) ? id : "introduction";
}

export function DocsApp() {
  const [page, setPage] = useState(readHash);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onHash = () => { setPage(readHash()); document.querySelector(`.${styles.main}`)?.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const filtered = useMemo(() => ENTRIES.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())), [query]);
  const go = (id: string) => { location.hash = id; };
  const entry = ENTRIES.find((e) => e.id === page);

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <span className={styles.brand}><Mark size={22} title="" />Spontaneous design system<small>0.2</small></span>
        <div className={styles.navRight}>
          <label className={styles.search}>
            <Search />
            <input placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" />
          </label>
          <Key size="md" onClick={() => { location.href = "/"; }}>Open the editor</Key>
        </div>
      </header>
      <aside className={styles.sidebar}>
        <div className={styles.group}>
          <h4 className={styles.groupTitle}>Foundations</h4>
          {FOUNDATIONS.map((f) => (
            <button key={f.id} type="button" className={styles.item} aria-current={page === f.id ? "page" : undefined} onClick={() => go(f.id)}>{f.name}</button>
          ))}
        </div>
        {LAYERS.map((layer) => {
          const items = filtered.filter((e) => e.layer === layer);
          if (!items.length) return null;
          return (
            <div key={layer} className={styles.group}>
              <h4 className={styles.groupTitle}><span>{layer}</span><span>{items.length}</span></h4>
              {items.map((e) => (
                <button key={e.id} type="button" className={styles.item} aria-current={page === e.id ? "page" : undefined} onClick={() => go(e.id)}>{e.name}</button>
              ))}
            </div>
          );
        })}
      </aside>
      <main className={styles.main}>
        <motion.article key={page} className={styles.article} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}>
          {entry ? <ComponentPage entry={entry} /> : <Foundation id={page as FoundationId} go={go} />}
        </motion.article>
      </main>
    </div>
  );
}

function ComponentPage({ entry }: { entry: DocEntry }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const details = DETAILS[entry.id];
  return (
    <>
      <div className={styles.crumb}><span>{entry.layer}</span></div>
      <h1 className={styles.title}>{entry.name}</h1>
      <p className={styles.lede}>{entry.description}</p>
      <div className={styles.tabs}>
        <Switcher label="View" value={tab} onChange={setTab} options={[{ value: "preview", label: "Preview" }, { value: "code", label: "Code" }]} />
      </div>
      {tab === "preview" ? (
        <div className={styles.preview} data-flush={entry.flush || undefined}>{entry.demo()}</div>
      ) : (
        <>
          <p className={styles.codeHead}>{entry.sourcePath}</p>
          <pre className={styles.code}>{entry.source}</pre>
        </>
      )}

      {details?.extra?.()}

      {details && (
        <>
          <h2 className={styles.h2}>Variants</h2>
          <p className={styles.limit}>{details.limit}</p>
          <table className={styles.table}>
            <thead><tr><th>Variant</th><th>Use when</th></tr></thead>
            <tbody>{details.variants.map((v) => <tr key={v.name}><td>{v.name}</td><td colSpan={2} className={styles.plain}>{v.when}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {details?.states && (
        <>
          <h2 className={styles.h2}>States</h2>
          <div className={styles.states}>
            {details.states.map((st) => (
              <figure key={st.name} className={styles.state}>
                <div className={styles.stateStage}>{st.render()}</div>
                <figcaption><b>{st.name}</b>{st.note}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {details?.interactions && (
        <>
          <h2 className={styles.h2}>Interactions</h2>
          <table className={styles.table}>
            <thead><tr><th>Input</th><th>Response</th></tr></thead>
            <tbody>{details.interactions.map((i) => <tr key={i.input}><td>{i.input}</td><td className={styles.plain}>{i.response}</td></tr>)}</tbody>
          </table>
        </>
      )}

      <h2 className={styles.h2}>Usage</h2>
      <pre className={styles.code}>{entry.usage}</pre>

      <h2 className={styles.h2}>Props</h2>
      <table className={styles.table}>
        <thead><tr><th>Prop</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>{entry.props.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.type}</td><td>{p.description}</td></tr>)}</tbody>
      </table>

      {entry.composedOf && (
        <>
          <h2 className={styles.h2}>Built from</h2>
          <div className={styles.chips}>{entry.composedOf.map((c) => <Tag key={c}>{c}</Tag>)}</div>
        </>
      )}

      <h2 className={styles.h2}>Notes for agents</h2>
      <div className={styles.note}>
        <h4>When to use</h4>
        <ul className={styles.ul}>{entry.whenToUse.map((w) => <li key={w}>{w}</li>)}</ul>
        {entry.whenNot && <><h4>When not to</h4><ul className={styles.ul} style={{ margin: 0 }}>{entry.whenNot.map((w) => <li key={w}>{w}</li>)}</ul></>}
      </div>
    </>
  );
}

function Foundation({ id, go }: { id: FoundationId; go: (id: string) => void }) {
  const name = FOUNDATIONS.find((f) => f.id === id)!.name;
  return (
    <>
      <div className={styles.crumb}><span>Foundations</span></div>
      <h1 className={styles.title}>{id === "introduction" ? "Spontaneous design system" : name}</h1>
      {id === "introduction" && <Intro go={go} />}
      {id === "color" && <ColorPage />}
      {id === "space" && <SpacePage />}
      {id === "materials" && <MaterialsPage />}
      {id === "type" && <TypePage />}
      {id === "motion" && <MotionPage />}
      {id === "interaction" && <InteractionPage />}
    </>
  );
}

function Intro({ go }: { go: (id: string) => void }) {
  return (
    <>
      <p className={styles.lede}>Everything in Spontaneous comes from the mark: a graphite tile carrying light, bevelled cells. The interface uses the same materials, so the app feels like one machined object.</p>
      <h2 className={styles.h2}>Structure</h2>
      <ul className={styles.ul}>
        <li><b>Foundations</b> are tokens: color, space, radius, materials, type and motion, all in <code>src/ui/tokens</code>.</li>
        <li><b>Atoms</b> are the smallest parts with one job: Key, IconKey, Tag, Cell, Timecode, Meter, Mark.</li>
        <li><b>Molecules</b> combine atoms into one interaction: Switcher, Group and Field, dock keys, cards.</li>
        <li><b>Organisms</b> are complete regions of the app: the docks, the stage, the timeline, the agent thread.</li>
        <li><b>Base controls</b> in <code>src/ui/base</code> (slider, switch, scrub input, tooltip) handle behavior and accessibility, styled entirely by these tokens.</li>
      </ul>
      <h2 className={styles.h2}>Rules</h2>
      <ul className={styles.ul}>
        <li>One primary key per surface; secondary for other real actions; tertiary for quiet and escape actions.</li>
        <li>Three signal colors, one meaning each: ink for what you marked, red for recording, blue for recorded footage. Everything else is graphite.</li>
        <li>Kinds are told apart by material and words, never by assigning hues.</li>
        <li>Who made an edit is always visible: a solid cell for you, a hollow cell for auto, the mark for the agent.</li>
        <li>Mono is for time. Nothing else.</li>
        <li>Springs for anything that moves on screen, and every animation has a reduced-motion branch.</li>
      </ul>
      <h2 className={styles.h2}>Components</h2>
      <div className={styles.cards}>
        {ENTRIES.map((e) => <button key={e.id} type="button" className={styles.card} onClick={() => go(e.id)}><b>{e.name}</b>{e.layer}</button>)}
      </div>
    </>
  );
}

const RAMP = ["950", "900", "850", "800", "750", "700", "650", "600", "500", "400", "300", "200", "100", "50"];
const SEMANTIC: [string, string][] = [
  ["--background", "App"], ["--surface", "Panels"], ["--surface-raised", "Cards"], ["--surface-muted", "Selected"],
  ["--foreground", "Text"], ["--text-secondary", "Secondary text"], ["--text-muted", "Labels"], ["--border", "Lines"],
  ["--ink", "Your marks"], ["--rec", "Recording"],
];

function ColorPage() {
  return (
    <>
      <p className={styles.lede}>A graphite ramp taken from the mark's tile and face, plus two signals. Ink is amber because it reads as a highlighter on both footage and graphite; it means "you marked this". Red only ever means recording.</p>
      <h2 className={styles.h2}>Graphite</h2>
      <div className={styles.ramp}>{RAMP.map((r) => <i key={r} style={{ background: `var(--g-${r})` }} title={`--g-${r}`} />)}</div>
      <h2 className={styles.h2}>Semantic</h2>
      <div className={styles.swatches}>
        {SEMANTIC.map(([v, use]) => <div key={v} className={styles.swatch}><i style={{ background: `var(${v})` }} /><b>{use}</b>{v}</div>)}
      </div>
    </>
  );
}

const SPACE = [["--space-0-5", 2], ["--space-1", 4], ["--space-1-5", 6], ["--space-2", 8], ["--space-2-5", 10], ["--space-3", 12], ["--space-4", 16], ["--space-5", 20], ["--space-6", 24], ["--space-8", 32], ["--space-10", 40], ["--space-12", 48]] as const;
const RADII = [["xs", 4], ["sm", 6], ["md", 8], ["lg", 10], ["key", 9], ["xl", 14], ["2xl", 18]] as const;

function SpacePage() {
  return (
    <>
      <p className={styles.lede}>A 4px grid. Radii are concentric: a key inside the dock uses the dock's radius minus the dock's padding, so curves stay parallel.</p>
      <h2 className={styles.h2}>Space</h2>
      <div className={styles.scale}>
        {SPACE.map(([v, px]) => <div key={v} className={styles.scaleRow}><code>{v}</code><span>{px}px</span><span className={styles.bar} style={{ width: px * 4 }} /></div>)}
      </div>
      <h2 className={styles.h2}>Radius</h2>
      <div className={styles.radii}>
        {RADII.map(([n, px]) => <div key={n} className={styles.radius} style={{ borderRadius: px }}>{n} · {px}</div>)}
      </div>
      <p className={styles.p} style={{ marginTop: 16 }}><code>--radius-key</code> = <code>--radius-dock</code> (14) − <code>--dock-pad</code> (5) = 9px.</p>
    </>
  );
}

function MaterialsPage() {
  return (
    <>
      <p className={styles.lede}>Depth comes from material, not from stacking borders and shadows. Each surface has exactly one treatment, lit from the top left like the mark.</p>
      <div className={styles.materials}>
        <div className={styles.material}><i style={{ background: "var(--surface)", boxShadow: "var(--card-shadow)", borderRadius: 10 }} /><b>Panel</b>Flat graphite. Holds everything else.</div>
        <div className={styles.material}><i style={{ background: "var(--key-bg)", boxShadow: "var(--key-shadow)", borderRadius: 9 }} /><b>Key</b>Lit top edge, shaded bottom. Most actions.</div>
        <div className={styles.material}><i style={{ background: "var(--face-bg)", boxShadow: "var(--face-shadow)", borderRadius: 9 }} /><b>Face</b>The mark's cell. One primary action.</div>
        <div className={styles.material}><i style={{ background: "var(--well-bg)", boxShadow: "var(--well-shadow)", borderRadius: 9 }} /><b>Well</b>Inset. Inputs and switchers sit in it.</div>
      </div>
      <h2 className={styles.h2}>Dock</h2>
      <p className={styles.p}>A floating slab for keys and wells: the annotation bar, the recorder, the composer. <code>--dock-bg</code> with <code>--dock-shadow</code>, radius <code>--radius-dock</code>, padding <code>--dock-pad</code>.</p>
    </>
  );
}

function TypePage() {
  const rows: [string, string, number, number][] = [
    ["--text-3xl", "Page title", 32, 600], ["--text-xl", "Section", 19, 600], ["--text-lg", "Lede", 16, 420],
    ["--text-base", "Body and controls", 13, 420], ["--text-sm", "Secondary", 12, 420], ["--text-xs", "Labels", 11, 520],
  ];
  return (
    <>
      <p className={styles.lede}>Geist for the interface, at 13px. Geist Mono only for time, so a timestamp is recognisable at a glance.</p>
      {rows.map(([v, use, px, w]) => <div key={v} className={styles.typeRow}><span>{v} · {px}</span><span style={{ fontSize: px, fontWeight: w, color: "var(--foreground)", letterSpacing: px > 18 ? "-.025em" : undefined }}>{use}</span></div>)}
      <div className={styles.typeRow}><span>Timecode</span><span className="mono" style={{ fontSize: 13, color: "var(--foreground)" }}>1:12.25</span></div>
    </>
  );
}

function MotionPage() {
  const [on, setOn] = useState(false);
  return (
    <>
      <p className={styles.lede}>Interface springs never overshoot; they settle. The camera uses the same model as the renderer, stored per project so it can be tuned.</p>
      <h2 className={styles.h2}>Interface</h2>
      <p className={styles.p}><code>snappy</code> for presses and toggles, <code>smooth</code> for panels, <code>morph</code> for keys sliding between options. Durations from 120ms (instant) to 480ms (considered).</p>
      <h2 className={styles.h2}>Camera</h2>
      <p className={styles.p}>Zoom and pan are spring channels (stiffness 200, damping 40, mass 2.25), retargeted mid-flight with velocity carried over.</p>
      <div className={styles.preview} style={{ minHeight: 160 }}>
        <div className={styles.springDemo}>
          <motion.div className={styles.springBox} animate={{ x: on ? 220 : 0, scale: on ? 1.2 : 1 }} transition={{ type: "spring", stiffness: 200, damping: 40, mass: 2.25 }} />
          <Key onClick={() => setOn(!on)}>Retarget</Key>
        </div>
      </div>
    </>
  );
}

const RULES: [string, string, string][] = [
  ["Hover", "Background or text lightens", "120–160ms, --ease-standard. Only on things you can click."],
  ["Press", "Seats 0.5px, scale .97–.98, inset shadow", "120ms. Icon keys and dock tools scale .94."],
  ["Select", "The chosen option rises as a key and slides", "Spring, visual 320ms, no bounce."],
  ["Focus", "2px light outline, 2px offset", "Keyboard only (:focus-visible). Text fields show a caret instead."],
  ["Disabled", "40% opacity, no pointer events", "Say why with a hint tooltip when it isn't obvious."],
  ["Reveal", "Scale from .94 and travel 3–6px away from the trigger", "--ease-reveal, 220ms. Tooltips, sheets, popovers."],
  ["Collapse", "Toward the trigger, faster than reveal", "--ease-collapse, 110ms."],
  ["Drag", "Grab cursor; the object follows the pointer 1:1", "No easing while dragging; settle on a spring on release."],
  ["Camera", "Zoom and pan follow springs", "Stiffness 200, damping 40, mass 2.25; retargets keep velocity."],
  ["Reduced motion", "Every transform becomes an opacity change", "Durations drop to near zero."],
];

function InteractionPage() {
  return (
    <>
      <p className={styles.lede}>Every interactive part answers the same inputs the same way. Component pages list their specific responses; these are the shared rules.</p>
      <table className={styles.table}>
        <thead><tr><th>Input</th><th>Response</th><th>Timing</th></tr></thead>
        <tbody>{RULES.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className={styles.plain}>{b}</td><td className={styles.plain}>{c}</td></tr>)}</tbody>
      </table>
    </>
  );
}
