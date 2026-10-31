/**
 * The Spontaneous mark's explorations, from the Mark Studio. Documentation only:
 * the app ships the Monolith material. Every material shares the same geometry
 * (pixel S, 5×5 compact, comet trail, 12° italic); only light, surface and
 * shadow change.
 */

type Mod = { x: number; y: number; w: number; h: number; rx: number; kind: "glyph" | "trail"; k: number; row: number; col: number; sx: number; sy: number; u: number; v: number };
type Mods = Mod[] & { bbox: { minX: number; maxX: number; minY: number; maxY: number; cx: number } };

export const SKEW = 12;
export const TAN = Math.tan((SKEW * Math.PI) / 180);
export const n = (v: number) => +(+v).toFixed(3);

function markModules(): Mods {
  const step = 10, m = 9.1, gap = step - m;
  const rows = [".####", "#....", ".###.", "....#", "####."];
  const x0 = -(5 * step - gap) / 2;
  const out = [] as unknown as Mods;
  rows.forEach((row, j) => {
    const runs: [number, number][] = [];
    let s = -1;
    for (let i = 0; i <= row.length; i++) {
      const on = row[i] === "#";
      if (on && s < 0) s = i;
      if (!on && s >= 0) { runs.push([s, i - 1]); s = -1; }
    }
    runs.forEach(([a, b]) => {
      for (let i = a; i <= b; i++) out.push({ x: x0 + i * step, y: x0 + j * step, w: m, h: m, rx: m * 0.15, kind: "glyph", k: 0, row: j, col: i, sx: 0, sy: 0, u: 0, v: 0 });
      if (b > a) {
        let left = x0 + a * step;
        const my = x0 + j * step + m / 2;
        for (let k = 1; k <= 2; k++) {
          const w = m * Math.pow(0.55, k);
          left = left - gap - w - (m - w) * 0.15;
          out.push({ x: left, y: my - w / 2, w, h: w, rx: w * 0.15, kind: "trail", k, row: j, col: a - k, sx: 0, sy: 0, u: 0, v: 0 });
        }
      }
    });
  });
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  out.forEach((o) => {
    const cy = o.y + o.h / 2;
    o.sx = o.x + o.w / 2 - TAN * cy;
    o.sy = cy;
    [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]].forEach(([x, y]) => {
      const X = x! - TAN * y!;
      minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, y!); maxY = Math.max(maxY, y!);
    });
  });
  out.forEach((o) => { o.u = (o.sx - minX) / (maxX - minX); o.v = (o.sy - minY) / (maxY - minY); });
  out.bbox = { minX, maxX, minY, maxY, cx: (minX + maxX) / 2 };
  return out;
}
export const MODS = markModules();

export function rectEl(o: { x: number; y: number; w: number; h: number; rx: number }, attrs: string, inset = 0) {
  return `<rect x="${n(o.x + inset)}" y="${n(o.y + inset)}" width="${n(o.w - 2 * inset)}" height="${n(o.h - 2 * inset)}" rx="${n(Math.max(0, o.rx - inset * 0.4))}" ${attrs}/>`;
}
export function modsSVG(attrFn: string | ((o: Mod) => string), inset: number | ((o: Mod) => number) = 0) {
  return MODS.map((o) => rectEl(o, typeof attrFn === "function" ? attrFn(o) : attrFn, typeof inset === "function" ? inset(o) : inset)).join("");
}
function markTransform(cx: number, cy: number, S: number) {
  const X0 = cx - MODS.bbox.cx * S * 0.5;
  return `translate(${n(X0)} ${n(cy)}) scale(${S}) skewX(${-SKEW})`;
}
function squirclePath(c = 512, a = 412, e = 5, N = 120) {
  const pts: number[][] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    pts.push([c + a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / e), c + a * Math.sign(st) * Math.pow(Math.abs(st), 2 / e)]);
  }
  return "M" + pts.map((p) => p.map(n).join(" ")).join(" L") + " Z";
}
const SQ = squirclePath();

function hex2rgb(h: string) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mix(a: string, b: string, t: number) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return "#" + A.map((x, i) => Math.round(x + (B[i]! - x) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0")).join("");
}
export function hash(a: number, b: number, c: number) { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); }

type Bevel = Partial<{ blur: number; scale: number; spec: number; exp: number; az: number; el: number; light: string; lightAmt: number; shade: number; shadeColor: string; shadeD: number; shadeBlur: number; rim: number; rimColor: string; rimD: number; rimBlur: number; grain: number }>;
export function fBevel(id: string, o: Bevel = {}) {
  const { blur = 5, scale = 4, spec = 1, exp = 24, az = 225, el = 50, light = "#fff", lightAmt = 1, shade = 0.35, shadeColor = "#000", shadeD = 5, shadeBlur = 4, rim = 0.5, rimColor = "#fff", rimD = 3, rimBlur = 2.5, grain = 0 } = o;
  const r = (az * Math.PI) / 180, lx = Math.cos(r), ly = Math.sin(r);
  return `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="b"/>
<feSpecularLighting in="b" surfaceScale="${scale}" specularConstant="${spec}" specularExponent="${exp}" lighting-color="${light}" result="sp"><feDistantLight azimuth="${az}" elevation="${el}"/></feSpecularLighting>
<feComposite in="sp" in2="SourceAlpha" operator="in" result="spIn"/>
<feColorMatrix in="spIn" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${lightAmt} 0" result="spA"/>
<feOffset in="SourceAlpha" dx="${n(lx * shadeD)}" dy="${n(ly * shadeD)}" result="so"/>
<feComposite in="SourceAlpha" in2="so" operator="out" result="sb"/>
<feGaussianBlur in="sb" stdDeviation="${shadeBlur}" result="sbb"/>
<feFlood flood-color="${shadeColor}" flood-opacity="${shade}"/>
<feComposite in2="sbb" operator="in" result="sh0"/>
<feComposite in="sh0" in2="SourceAlpha" operator="in" result="sh"/>
<feOffset in="SourceAlpha" dx="${n(-lx * rimD)}" dy="${n(-ly * rimD)}" result="ro"/>
<feComposite in="SourceAlpha" in2="ro" operator="out" result="rb"/>
<feGaussianBlur in="rb" stdDeviation="${rimBlur}" result="rbb"/>
<feFlood flood-color="${rimColor}" flood-opacity="${rim}"/>
<feComposite in2="rbb" operator="in" result="rm0"/>
<feComposite in="rm0" in2="SourceAlpha" operator="in" result="rm"/>
${grain ? `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="nz"/>
<feColorMatrix in="nz" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${grain} 0 0 0 ${n(-grain * 0.45)}" result="nz2"/>
<feComposite in="nz2" in2="SourceAlpha" operator="in" result="gr"/>` : ""}
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/><feMergeNode in="rm"/><feMergeNode in="spA"/>${grain ? '<feMergeNode in="gr"/>' : ""}</feMerge>
</filter>`;
}
function fShadow(id: string, { dx = 0, dy = 12, blur = 14, color = "#000", op = 0.5 } = {}) {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/><feOffset dx="${dx}" dy="${dy}" result="o"/>
<feFlood flood-color="${color}" flood-opacity="${op}"/><feComposite in2="o" operator="in"/></filter>`;
}
export function fBlur(id: string, b: number) {
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${b}"/></filter>`;
}
type Stop = [number, string, number?];
export function lin(id: string, x1: number, y1: number, x2: number, y2: number, stops: Stop[], units = "userSpaceOnUse", extra = "") {
  return `<linearGradient id="${id}" gradientUnits="${units}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
}
function rad(id: string, cx: number, cy: number, r: number, stops: Stop[], units = "userSpaceOnUse", extra = "") {
  return `<radialGradient id="${id}" gradientUnits="${units}" cx="${cx}" cy="${cy}" r="${r}" ${extra}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;
}

const MT = markTransform(512, 512, 8.6);
function shell(P: string, { defs = "", bg = "", body = "", rimTop = 0.22, rimBottom = 0.35 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs><clipPath id="${P}tile"><path d="${SQ}"/></clipPath>
${lin(P + "rim", 0, 100, 0, 924, [[0, "#fff", rimTop], [0.25, "#fff", 0], [0.75, "#000", 0], [1, "#000", rimBottom]])}
${defs}</defs>
<g clip-path="url(#${P}tile)">${bg}${body}<path d="${SQ}" fill="none" stroke="url(#${P}rim)" stroke-width="6"/></g>
</svg>`;
}
const M = (inner: string, attrs = "") => `<g transform="${MT}" ${attrs}>${inner}</g>`;

export interface MarkMaterial { id: string; name: string; note: string; shipped?: boolean; svg: (prefix: string) => string }

export const MATERIALS: MarkMaterial[] = [
  { id: "graphite", name: "Graphite", note: "Brushed silver lit from the upper right, with a soft halo and a cast shadow.", svg: (P) => shell(P, {
    defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#2c2d31"], [0.55, "#151619"], [1, "#0a0b0c"]]) + rad(P + "sheen", 700, 160, 620, [[0, "#fff", 0.13], [1, "#fff", 0]]) +
      lin(P + "metal", 26, -26, -32, 26, [[0, "#ffffff"], [0.28, "#f1f2f4"], [0.6, "#a9adb4"], [1, "#5f636a"]]) +
      fBevel(P + "bev", { az: 315, el: 52, blur: 4, scale: 3.5, exp: 34, lightAmt: 0.75, shade: 0.45, shadeD: 4, rim: 0.85, rimD: 2.5, rimBlur: 1.6, grain: 0.18 }) +
      fShadow(P + "cast", { dx: -14, dy: 18, blur: 16, op: 0.75 }) + fBlur(P + "halo", 22),
    bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}sheen)"/>`,
    body: `<g filter="url(#${P}cast)">${M(modsSVG('fill="#000"'))}</g><g filter="url(#${P}halo)" opacity=".42">${M(modsSVG('fill="#fff"'))}</g><g filter="url(#${P}bev)">${M(modsSVG(`fill="url(#${P}metal)"`))}</g>`,
  }) },
  { id: "indigo", name: "Indigo Mosaic", note: "Each module splits into sub-pixels that brighten toward the light.", svg: (P) => {
    const B = MODS.bbox; let cells = "";
    MODS.forEach((o, i) => {
      const sub = o.k === 0 ? 3 : o.k === 1 ? 2 : 1, cw = o.w / sub;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const x = o.x + a * cw, y = o.y + b * cw, cy = y + cw / 2, px = x + cw / 2 - TAN * cy;
        let t = ((px - B.minX) / (B.maxX - B.minX)) * 0.62 + (1 - (cy - B.minY) / (B.maxY - B.minY)) * 0.38;
        t = Math.pow(t, 1.15) + (hash(i, a, b) - 0.5) * 0.22;
        if (o.k) t *= 0.62;
        cells += `<rect x="${n(x)}" y="${n(y)}" width="${n(cw + 0.03)}" height="${n(cw + 0.03)}" fill="${mix("#5f64ee", "#ffffff", Math.pow(Math.max(0, t), 0.8))}"/>`;
      }
    });
    return shell(P, {
      defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#5c61f2"], [1, "#2c31b8"]]) + rad(P + "glow", 760, 250, 520, [[0, "#c9cbff", 0.55], [1, "#c9cbff", 0]]) +
        `<clipPath id="${P}mods">${modsSVG("")}</clipPath>` +
        fBevel(P + "bev", { az: 315, el: 55, blur: 3, scale: 2.5, exp: 40, lightAmt: 0.45, shade: 0.35, shadeColor: "#1b1f8a", shadeD: 3.5, rim: 0.9, rimD: 2, rimBlur: 1.2 }) +
        fShadow(P + "cast", { dx: -16, dy: 20, blur: 18, color: "#11147a", op: 0.7 }),
      bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}glow)"/>`,
      body: `<g filter="url(#${P}cast)">${M(modsSVG('fill="#000"'))}</g><g filter="url(#${P}bev)">${M(`<g clip-path="url(#${P}mods)">${cells}</g>`)}</g>`,
      rimTop: 0.35, rimBottom: 0.3,
    });
  } },
  { id: "monolith", name: "Monolith", shipped: true, note: "Matte white with a soft, pillowy chamfer and a deep drop shadow. The shipped app icon.", svg: (P) => shell(P, {
    defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#303030"], [1, "#060606"]]) + rad(P + "sheen", 512, 60, 700, [[0, "#fff", 0.08], [1, "#fff", 0]]) +
      lin(P + "face", 0, -25, 0, 25, [[0, "#fbfbfb"], [0.55, "#dedede"], [1, "#bdbdbd"]]) +
      fBevel(P + "bev", { az: 250, el: 42, blur: 5.5, scale: 4, exp: 16, lightAmt: 0.35, shade: 0.55, shadeD: 6, shadeBlur: 5, rim: 1, rimD: 3, rimBlur: 1.8 }) +
      fShadow(P + "drop", { dy: 26, blur: 20, op: 0.8 }) + fShadow(P + "amb", { dy: 50, blur: 46, op: 0.5 }),
    bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}sheen)"/>`,
    body: `<g filter="url(#${P}amb)">${M(modsSVG('fill="#000"'))}</g><g filter="url(#${P}drop)">${M(modsSVG('fill="#000"'))}</g><g filter="url(#${P}bev)">${M(modsSVG(`fill="url(#${P}face)"`))}</g>`,
    rimTop: 0.28,
  }) },
  { id: "engraved", name: "Engraved", note: "The S is cut into brushed aluminium: shadow on the upper wall of each cut, light on the lower lip.", svg: (P) => shell(P, {
    defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#eef0f2"], [0.5, "#cfd3d8"], [1, "#a7acb3"]]) +
      `<filter id="${P}brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.002 0.55" numOctaves="2" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.9 0 0 0 -0.3"/></filter>` +
      lin(P + "cut", 0, -25, 0, 25, [[0, "#8d939b"], [1, "#b9bec5"]]) +
      `<filter id="${P}carve" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
<feOffset in="SourceAlpha" dx="5" dy="8" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="b1"/>
<feGaussianBlur in="b1" stdDeviation="3" result="bb1"/><feFlood flood-color="#2d3238" flood-opacity=".75"/><feComposite in2="bb1" operator="in" result="s1"/>
<feComposite in="s1" in2="SourceAlpha" operator="in" result="top"/>
<feOffset in="SourceAlpha" dx="-2" dy="-3" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="b2"/>
<feGaussianBlur in="b2" stdDeviation="1" result="bb2"/><feFlood flood-color="#fff" flood-opacity=".8"/><feComposite in2="bb2" operator="in" result="s2"/>
<feComposite in="s2" in2="SourceAlpha" operator="in" result="bot"/>
<feOffset in="SourceAlpha" dx="1.5" dy="2.5" result="o3"/><feComposite in="o3" in2="SourceAlpha" operator="out" result="lip0"/>
<feGaussianBlur in="lip0" stdDeviation=".8" result="lip1"/><feFlood flood-color="#fff" flood-opacity=".9"/><feComposite in2="lip1" operator="in" result="lip"/>
<feMerge><feMergeNode in="lip"/><feMergeNode in="SourceGraphic"/><feMergeNode in="top"/><feMergeNode in="bot"/></feMerge></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" filter="url(#${P}brush)" opacity=".35"/>`,
    body: `<g filter="url(#${P}carve)">${M(modsSVG(`fill="url(#${P}cut)"`))}</g>`,
    rimTop: 0.7, rimBottom: 0.25,
  }) },
  { id: "neon", name: "Neon Tube", note: "Each module is a bent glass tube, cyan to magenta, with a white-hot core and a two-step bloom.", svg: (P) => {
    const tubes = (attrs: string) => M(modsSVG(attrs, (o) => (o.k === 2 ? 0.35 : 0.6)));
    return shell(P, {
      defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#0d0f22"], [1, "#04050b"]]) + rad(P + "amb", 512, 520, 430, [[0, "#6b3dff", 0.28], [1, "#6b3dff", 0]]) +
        lin(P + "tube", 24, -24, -34, 24, [[0, "#47f3ff"], [0.5, "#8b7dff"], [1, "#ff4fd2"]]) + fBlur(P + "g1", 26) + fBlur(P + "g2", 7),
      bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}amb)"/>`,
      body: `<g filter="url(#${P}g1)" opacity=".9">${tubes(`fill="none" stroke="url(#${P}tube)" stroke-width="1.6"`)}</g>
<g filter="url(#${P}g2)" opacity=".9">${tubes(`fill="none" stroke="url(#${P}tube)" stroke-width="1.2"`)}</g>
${tubes(`fill="url(#${P}tube)" fill-opacity=".07" stroke="url(#${P}tube)" stroke-width="1.15"`)}
${tubes(`fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".32"`)}`,
      rimTop: 0.18,
    });
  } },
  { id: "ember", name: "Ember", note: "The glyph glows molten and the trail cools to dark red behind it. Heat stands in for speed.", svg: (P) => shell(P, {
    defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#1d0905"], [1, "#050101"]]) + rad(P + "heat", 520, 520, 420, [[0, "#ff4d12", 0.45], [1, "#ff4d12", 0]]) +
      rad(P + "hot", 0.5, 0.45, 0.75, [[0, "#fffbe0"], [0.35, "#ffd36a"], [0.7, "#ff7a1f"], [1, "#d8380c"]], "objectBoundingBox") +
      rad(P + "warm", 0.5, 0.45, 0.75, [[0, "#ffc06a"], [0.55, "#ff5a16"], [1, "#a1200a"]], "objectBoundingBox") +
      rad(P + "cool", 0.5, 0.45, 0.75, [[0, "#ff6a2b"], [1, "#6d1306"]], "objectBoundingBox") +
      fBlur(P + "g1", 30) + fBlur(P + "g2", 8) +
      fBevel(P + "bev", { az: 270, el: 60, blur: 3, scale: 2, exp: 40, light: "#ffe7c2", lightAmt: 0.5, shade: 0.5, shadeColor: "#5a0f02", shadeD: 3, rim: 0.4, rimColor: "#fff3d0", rimD: 1.6, rimBlur: 1 }),
    bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}heat)"/>`,
    body: `<g filter="url(#${P}g1)" opacity=".85">${M(modsSVG((o) => `fill="${["#ff6a1f", "#ff3d0f", "#a51a06"][o.k]}"`))}</g>
<g filter="url(#${P}g2)" opacity=".7">${M(modsSVG((o) => `fill="url(#${P}${["hot", "warm", "cool"][o.k]})"`))}</g>
<g filter="url(#${P}bev)">${M(modsSVG((o) => `fill="url(#${P}${["hot", "warm", "cool"][o.k]})"`))}</g>`,
    rimTop: 0.14,
  }) },
  { id: "keycaps", name: "Keycaps", note: "Every module is a physical key with a dished top and a visible wall. The trail keys are signal orange.", svg: (P) => {
    const cap = (o: Mod) => {
      const t = o.k ? "o" : "w";
      const ix = o.w * 0.1, it = o.h * 0.05, ib = o.h * 0.2;
      return `${rectEl(o, `fill="url(#${P}wall${t})"`)}<rect x="${n(o.x + ix)}" y="${n(o.y + it)}" width="${n(o.w - 2 * ix)}" height="${n(o.h - it - ib)}" rx="${n(o.rx * 1.25)}" fill="url(#${P}top${t})"/><rect x="${n(o.x + ix)}" y="${n(o.y + it)}" width="${n(o.w - 2 * ix)}" height="${n(o.h - it - ib)}" rx="${n(o.rx * 1.25)}" fill="url(#${P}dish)"/>`;
    };
    return shell(P, {
      defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#34373c"], [1, "#16171a"]]) + rad(P + "spot", 512, 380, 560, [[0, "#fff", 0.1], [1, "#fff", 0]]) +
        lin(P + "wallw", 0, 0, 0, 1, [[0, "#d7dadf"], [1, "#8b9098"]], "objectBoundingBox") + lin(P + "topw", 0, 0, 1, 1, [[0, "#ffffff"], [1, "#e1e3e7"]], "objectBoundingBox") +
        lin(P + "wallo", 0, 0, 0, 1, [[0, "#ff8a4a"], [1, "#b23d0c"]], "objectBoundingBox") + lin(P + "topo", 0, 0, 1, 1, [[0, "#ffa06a"], [1, "#ff6a2b"]], "objectBoundingBox") +
        rad(P + "dish", 0.4, 0.35, 0.7, [[0, "#fff", 0.5], [0.6, "#fff", 0], [1, "#000", 0.06]], "objectBoundingBox") +
        fShadow(P + "drop", { dy: 18, blur: 12, op: 0.7 }) + fShadow(P + "amb", { dy: 34, blur: 34, op: 0.45 }),
      bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/><rect width="1024" height="1024" fill="url(#${P}spot)"/>`,
      body: `<g filter="url(#${P}amb)">${M(modsSVG('fill="#000"'))}</g><g filter="url(#${P}drop)">${M(modsSVG('fill="#000"'))}</g>${M(MODS.map(cap).join(""))}`,
    });
  } },
  { id: "holo", name: "Holo Foil", note: "Iridescent foil with fine etched lines and a hard specular edge. Its colour shifts across the tiles.", svg: (P) => shell(P, {
    defs: lin(P + "bg", 0, 100, 0, 924, [[0, "#15151d"], [1, "#050507"]]) +
      lin(P + "foil", -30, -24, -18, -12, [[0, "#8ef6ff"], [0.22, "#c7a6ff"], [0.45, "#ffb0dc"], [0.68, "#ffe7a3"], [0.86, "#a6ffd5"], [1, "#8ef6ff"]], "userSpaceOnUse", 'spreadMethod="reflect"') +
      `<pattern id="${P}etch" patternUnits="userSpaceOnUse" width=".9" height=".9" patternTransform="rotate(-38)"><rect width=".9" height=".3" fill="#fff" fill-opacity=".3"/></pattern>` +
      fBevel(P + "bev", { az: 300, el: 48, blur: 3.5, scale: 3.5, exp: 48, lightAmt: 1, shade: 0.4, shadeColor: "#2a1a55", shadeD: 3.5, rim: 0.8, rimD: 2, rimBlur: 1.2 }) +
      fBlur(P + "glow", 28) + fShadow(P + "sh", { dx: -6, dy: 18, blur: 18, op: 0.8 }),
    bg: `<rect width="1024" height="1024" fill="url(#${P}bg)"/>`,
    body: `<g filter="url(#${P}glow)" opacity=".35">${M(modsSVG(`fill="url(#${P}foil)"`))}</g><g filter="url(#${P}sh)">${M(modsSVG('fill="#000"'))}</g>
<g filter="url(#${P}bev)">${M(modsSVG(`fill="url(#${P}foil)"`) + modsSVG(`fill="url(#${P}etch)"`))}</g>`,
    rimTop: 0.3,
  }) },
];

/* ───────────────────────── Boot reveal ───────────────────────── */

const VW = 1600, VH = 900, S = 9, CY = 450;
const X0 = VW / 2 - MODS.bbox.cx * S * 0.5;
const T = `translate(${n(X0)} ${CY}) scale(${S}) skewX(${-SKEW})`;
const B = MODS.bbox;
const markTop = CY + B.minY * S, markBot = CY + B.maxY * S;
const markL = X0 + B.minX * S, markR = X0 + B.maxX * S;
const beamEnd = markR - markL + 520;

/** The Boot stage: a dim mark, a lit chrome mark over it, and a light beam. */
export function bootStageSVG(P = "boot-") {
  return `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;display:block">
<defs>
${lin(P + "metal", 26, -26, -32, 26, [[0, "#ffffff"], [0.3, "#f2f3f5"], [0.62, "#aeb2b9"], [1, "#666a72"]])}
${fBevel(P + "bev", { az: 315, el: 52, blur: 4.5, scale: 4, exp: 34, lightAmt: 0.8, shade: 0.5, shadeD: 5, rim: 0.9, rimD: 3, rimBlur: 1.8, grain: 0.16 })}
${fBevel(P + "dim", { az: 315, el: 40, blur: 4.5, scale: 4, exp: 30, light: "#b8bcc6", lightAmt: 0.22, shade: 0.6, shadeD: 5, rim: 0.16, rimColor: "#d8dae0", rimD: 2.5, rimBlur: 1.6 })}
<filter id="${P}glow" x="-40%" y="-80%" width="180%" height="260%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceGraphic" stdDeviation="16" result="g1"/><feColorMatrix in="g1" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .55 0" result="g1a"/>
<feGaussianBlur in="SourceGraphic" stdDeviation="60" result="g2"/><feColorMatrix in="g2" type="matrix" values=".8 0 0 0 0 0 .82 0 0 0 0 0 1 0 0 0 0 0 .5 0" result="g2a"/>
<feMerge><feMergeNode in="g2a"/><feMergeNode in="g1a"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="${P}beam" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="${P}clip"><g transform="${T}">${modsSVG("")}</g></clipPath>
</defs>
<g filter="url(#${P}dim)"><g transform="${T}">${modsSVG('fill="#121318"')}</g></g>
<g filter="url(#${P}glow)"><g filter="url(#${P}bev)"><g transform="${T}" data-lit>${modsSVG(`fill="url(#${P}metal)"`)}</g></g></g>
<g clip-path="url(#${P}clip)"><g transform="translate(${n(X0)} ${CY}) skewX(-12) translate(${n(-X0)} ${-CY})"><rect data-beam x="${markL - 260}" y="${markTop - 40}" width="200" height="${markBot - markTop + 80}" fill="url(#${P}beam)" opacity="0"/></g></g>
</svg>`;
}

type KF = Keyframe & { offset?: number };
function loop(el: Element, C: number, pts: [number, Keyframe, string?][], base: Keyframe = { opacity: 0 }) {
  pts = pts.slice().sort((a, b) => a[0] - b[0]);
  const kf: KF[] = [{ ...base, offset: 0 }];
  pts.forEach(([t, p, e]) => kf.push({ ...base, ...p, offset: Math.min(1, Math.max(0, t / C)), ...(e ? { easing: e } : {}) }));
  kf.push({ ...base, offset: 1 });
  return el.animate(kf, { duration: C, iterations: Infinity });
}
const SWEEP = "cubic-bezier(.45,0,.25,1)";
const beamPass = (t: number, d: number): [number, Keyframe, string?][] => [
  [t, { opacity: 0, transform: "translateX(0)" }, SWEEP], [t + d * 0.12, { opacity: 1, transform: `translateX(${beamEnd * 0.12}px)` }, "linear"],
  [t + d * 0.88, { opacity: 1, transform: `translateX(${beamEnd * 0.88}px)` }, SWEEP], [t + d, { opacity: 0, transform: `translateX(${beamEnd}px)` }], [t + d + 1, { opacity: 0, transform: "translateX(0)" }],
];

/**
 * Boot: the pixels flicker on in reading order, a light sweeps across, then
 * they power down in reverse with a short flicker. Returns a stop function.
 */
export function runBoot(svg: SVGSVGElement, C = 6800) {
  const litGroup = svg.querySelector("[data-lit]");
  const beam = svg.querySelector("[data-beam]");
  if (!litGroup || !beam) return () => {};
  const lit = [...litGroup.children].map((el, i) => ({ el, m: MODS[i]! }));
  const order = lit.slice().sort((a, b) => a.m.k - b.m.k || a.m.row - b.m.row || a.m.col - b.m.col);
  const STEP = "steps(1, end)";
  const anims = order.map(({ el }, i) => {
    const on = 300 + i * 105 + hash(i, 3.1, 7.7) * 70, off = 4400 + (order.length - 1 - i) * 60;
    return loop(el, C, [[on, { opacity: 0 }, STEP], [on + 80, { opacity: 0.9 }, STEP], [on + 170, { opacity: 0.1 }, STEP], [on + 270, { opacity: 0.75 }, STEP], [on + 350, { opacity: 0.25 }, STEP], [on + 560, { opacity: 1 }],
      [off, { opacity: 1 }, STEP], [off + 70, { opacity: 0.2 }, STEP], [off + 150, { opacity: 0.8 }, STEP], [off + 260, { opacity: 0 }]]);
  });
  anims.push(loop(beam, C, beamPass(3000, 1100), { opacity: 0, transform: "translateX(0)" }));
  return () => anims.forEach((a) => a.cancel());
}
