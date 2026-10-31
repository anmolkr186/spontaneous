# Shot library

Where a recording sits and how the camera moves. Built in `src/editor/shots.ts` (data and motion), `src/ui/organisms/shot` (scene, device models, thumbnails). iPhone shots are out of scope for now.

## Two sets

| Set | For | Shots |
|---|---|---|
| **Basics** | Demos, docs, support videos. The UI is the subject. | Zoom focus, Clean window, Floating tile, Desktop display |
| **Director's Cut** | Launch videos and trailers. The product is staged on a device and the camera has a point of view. | Lid Rise, Orbit In, Screen Takeover, Monolith Rise, Right Pan, Left Pan, Low Hero, Desk Top-Down, Edge Glide, Tile Stack, Infinite Wall |

## Point of view

- **One idea per shot.** Each shot makes a single camera statement (open, swing, push, glide, rise). Some combine two primitives that read as one move, like a lid opening while the camera eases closer.
- **The screen is the brightest thing in frame.** Devices are graphite; backdrops are either quiet graphite tones or a colour set: soft glows on a deep base, never flat gradients.
- **Light matches the mark:** key light from the upper left, shadows down and to the right.
- **Springs, not durations.** Moves use a critically damped spring: fast start, no overshoot, settles. Drifts are linear so they read as constant camera travel.
- **Rest, then hold.** Every shot ends in a resting pose and holds for as long as the clip plays. Auto-zooms and cursor still happen inside the screen.

## Motion primitives

Every shot is a starting pose plus a short list of primitives. A primitive is `{ kind, from, to, at, duration, curve }`.

| Primitive | Moves | Unit | Reads as |
|---|---|---|---|
| Orbit | camera yaw around the device | degrees | swinging around to face it |
| Tilt | camera pitch | degrees | rising over it or dropping below |
| Push | dolly in/out | × of rest framing | moving closer or pulling back |
| Truck | camera sideways | % of frame | sliding past |
| Pedestal | camera up/down | % of frame | rising or lowering |
| Rise | the device lifts into frame | % of frame | the product arriving |
| Lid | laptop lid angle | degrees | opening the laptop |
| Settle | a tilted tile lays flat | 1 → 0 | a card landing |
| Drift | slow constant truck | % of frame | ambient travel |
| Shuffle | next card to the front | index | flipping through |
| Hold | nothing | | resting on the clip |

### Tuning, by you or the agent

Each project carries `motion: { speed, amount }`:
- **Speed** multiplies time: 0.7 is calmer, 1.35 is snappier.
- **Amount** scales how far every primitive travels *toward its resting value*, so the final framing never changes. 0 is a still shot; 1.4 is more dramatic.

The agent maps descriptions onto these: "slower" → speed × 0.7; "snappier" → × 1.35; "subtle" → amount 0.6; "more dramatic" → 1.4; "keep it still" → 0. Naming a shot ("make it an orbit in") swaps the shot. Next: let the agent edit individual primitives (for example "start the orbit from further right" sets the orbit's `from`).

## Basics

**Zoom focus**: the recording in a browser frame on graphite. Primitives: *Hold*. The camera is driven by the auto-zooms from your clicks.

**Clean window**: the recording with no chrome on orchid. Primitives: *Hold*.

**Floating tile**: the screen as a rounded tile, starting tilted (X 12°, Y −18°). Primitives: *Settle 1→0 at 0.2s over 1.4s* (spring), *Push 0.94→1 at 0.2s over 1.6s* (spring). Lagoon backdrop.

**Desktop display**: a monitor on a stand, straight-on. Primitives: *Push 0.96→1.04 over 6s* (linear). Sand backdrop.

## Director's Cut

**Lid Rise** (opener): three-quarter front, yaw 18°, pitch 14°, lid closed. Tangerine.
- Lid 0→108° at 0.2s over 1.6s (spring). The screen fades up as the lid passes 80°.
- Orbit 18→12° at 1.2s over 1.6s (spring).
- Push 0.92→1 at 0.2s over 2.4s (spring).

**Orbit In**: three-quarter right (yaw 34°, pitch 8°) → straight-on. Cobalt.
- Orbit 34→0° at 0.1s over 2.4s (spring).
- Tilt 8→4° at 0.1s over 2.4s (spring).

**Screen Takeover** (transition into the UI): straight-on, pulled back. Orchid.
- Push 0.8→2.6 at 0.3s over 1.8s (spring), ending with the screen filling the frame.

**Monolith Rise** (brand opener): a display on a graphite plinth, slight low angle (pitch −6°). Graphite.
- Rise 40→0% at 0.1s over 1.6s (spring).

**Right Pan**: three-quarter from the right (yaw 28°, pitch 6°), framed left so the right third is open for a title. Citrus.
- Truck −14→−18% over 6s (linear).

**Left Pan**: the mirror (yaw −28°), open space on the left. Sunset.
- Truck 14→18% over 6s (linear).

**Low Hero** (the big feature, once per video): camera at deck height looking slightly up (pitch −5°, yaw 12°). Ember.
- Push 1.05→1.14 over 6s (linear).

**Desk Top-Down**: overhead (pitch 56°), lid opened wider (124°) so the screen still faces the camera, keyboard visible. Sand.
- Orbit −6→6° over 6s (linear): a slow turn.

**Edge Glide** (detail moment, b-roll): grazing angle (yaw 52°), close (push 1.7). Lagoon.
- Truck 10→−10% over 2.6s (spring).

**Tile Stack** (three things in a release): three tiles fanned in depth. Rose.
- Shuffle 0→1 at 2.2s over 0.45s (spring).
- Shuffle 1→2 at 4.4s over 0.45s (spring).

**Infinite Wall** (breadth): a grid of 15 screens in perspective (pitch 18°). Cobalt.
- Drift 6→−6% over 3.2s (linear).
- Push 0.9→2.1 at 3.2s over 1.4s (spring): the centre screen comes forward.

## Storyboards

**Launch, 20s (16:9)**: Lid Rise (3s) → Screen Takeover (1.8s) → Zoom focus on feature 1 (4s) → Right Pan on feature 2 (4s) → Tile Stack (3s) → end card with the mark's Boot reveal (3s).

**Walkthrough, 45s (16:9)**: Orbit In → alternating Right Pan / Left Pan per feature (6–8s each) → Edge Glide between sections → Desktop display + end card.

**Social, 15s (1:1 or 4:5)**: Floating tile (8s) → Tile Stack (4s) → end card (3s).

**Changelog, 10s (1:1)**: Title card (2s) → Tile Stack (6s) → end card (2s).

## Backdrops

Backdrops are images from two sets, **Natural** and **Gradient & ASCII**, plus a few neutrals (Graphite, Slate, Paper, None). The sources live in `backdrops/`; `python3 scripts/build_backdrops.py` turns them into web images and thumbnails in `public/backdrops/` and writes the manifest `src/editor/backdrops.gen.ts`. Run it again after adding images.

Every project starts on **Hero 67** (Natural). Shots don't carry a backdrop of their own: switching shots keeps yours, and every thumbnail shows Hero 67 so the cards compare like for like.

## Picking a shot

With no clip, picking a shot previews it on its own. With a clip, picking a shot applies it to the clip and opens the preview; **Back to clip** at the bottom centre returns to the clip, which already has the shot.

## Span

A shot plays over a span: `project.span = { start, length }`. Its move starts at `start` and the template runs for `length`: the move, then rest. On a clip the span defaults to the whole clip. With no clip it follows the shot (its move plus 1.5s), and it can never be shorter than the move at the current speed.

## Preview

With no clip, the stage previews the chosen shot on its own: the stand-in screen, no cursor, no notes, no ink. A small timeline under the artboard plays and scrubs the span, draws each move where it happens, and sets the span's length. On a clip, **Preview shot** on the stage switches to the same view, and **Back to clip** returns.

## Stand-in screen

Thumbnails, the preview and the docs all show one stand-in screen: the Spontaneous editor drawn from the design tokens (title bar with the Lite/Studio switch, stage, agent panel, timeline with a blue clip). Only the colour inside its stage changes per shot, so every template is judged against the same real interface. It never shows notes or ink; those appear only on a clip once you leave one.

## Models

The devices are our own CSS 3D models, built from six-faced boxes so they have real thickness at any angle:
- **Laptop**: lid with aluminium edges and a debossed mark on the back; a base with a keyboard well, speaker grilles, trackpad, hinge and front scoop; a soft floor shadow offset away from the key light.
- **Display**: thin-bezel panel with an aluminium back, a neck and a flat foot; Monolith Rise adds a graphite plinth.
- **Tiles**: glass slabs with lit edges, used alone, in the stack and in the wall.

Materials stay graphite but read as real: brushed aluminium grain on metal faces, glass screens with a soft reflection and a crisp top edge, light from the screen falling on the keyboard deck, a faint bloom around lit screens, and two floor shadows (a soft one offset from the key light, and a tight contact shadow at the edges). The plinth is matte stone. Light is a key from the upper left: left and top faces are lit, right faces are in shade. When the native renderer lands, these become real 3D models with the same names, poses and primitives, so shots and projects carry over unchanged.
