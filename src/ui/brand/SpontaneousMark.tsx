import { useId } from "react";

export interface SpontaneousMarkProps {
  /** Rendered size in px. The mark is always square. */
  size?: number;
  className?: string;
  /** Accessible name. Pass an empty string when the mark sits next to the word "Spontaneous". */
  title?: string;
}

/** The squares that make up the "S". Shared by the shadow, drop and face layers. */
const CELLS: [x: number, y: number, s: number, r: number][] = [
  [-14.55, -24.55, 9.1, 1.365], [-4.55, -24.55, 9.1, 1.365], [5.45, -24.55, 9.1, 1.365], [15.45, -24.55, 9.1, 1.365],
  [-21.069, -22.503, 5.005, 0.751], [-25.674, -21.376, 2.753, 0.413],
  [-24.55, -14.55, 9.1, 1.365],
  [-14.55, -4.55, 9.1, 1.365], [-4.55, -4.55, 9.1, 1.365], [5.45, -4.55, 9.1, 1.365],
  [-21.069, -2.503, 5.005, 0.751], [-25.674, -1.376, 2.753, 0.413],
  [15.45, 5.45, 9.1, 1.365],
  [-24.55, 15.45, 9.1, 1.365], [-14.55, 15.45, 9.1, 1.365], [-4.55, 15.45, 9.1, 1.365], [5.45, 15.45, 9.1, 1.365],
  [-31.069, 17.497, 5.005, 0.751], [-35.674, 18.624, 2.753, 0.413],
];

/** Superellipse tile outline (the macOS icon shape), 100–924 in a 1024 box. */
const TILE =
  "M924 512 L923.774 638.595 L923.096 678.952 L921.963 708.169 L920.375 731.811 L918.326 751.936 L915.812 769.567 L912.828 785.293 L909.365 799.49 L905.414 812.411 L900.964 824.238 L896.002 835.103 L890.513 845.108 L884.476 854.331 L877.87 862.834 L870.667 870.667 L862.834 877.87 L854.331 884.476 L845.108 890.513 L835.103 896.002 L824.238 900.964 L812.411 905.414 L799.49 909.365 L785.293 912.828 L769.567 915.812 L751.936 918.326 L731.811 920.375 L708.169 921.963 L678.952 923.096 L638.595 923.774 L512 924 L385.405 923.774 L345.048 923.096 L315.831 921.963 L292.189 920.375 L272.064 918.326 L254.433 915.812 L238.707 912.828 L224.51 909.365 L211.589 905.414 L199.762 900.964 L188.897 896.002 L178.892 890.513 L169.669 884.476 L161.166 877.87 L153.333 870.667 L146.13 862.834 L139.524 854.331 L133.487 845.108 L127.998 835.103 L123.036 824.238 L118.586 812.411 L114.635 799.49 L111.172 785.293 L108.188 769.567 L105.674 751.936 L103.625 731.811 L102.037 708.169 L100.904 678.952 L100.226 638.595 L100 512 L100.226 385.405 L100.904 345.048 L102.037 315.831 L103.625 292.189 L105.674 272.064 L108.188 254.433 L111.172 238.707 L114.635 224.51 L118.586 211.589 L123.036 199.762 L127.998 188.897 L133.487 178.892 L139.524 169.669 L146.13 161.166 L153.333 153.333 L161.166 146.13 L169.669 139.524 L178.892 133.487 L188.897 127.998 L199.762 123.036 L211.589 118.586 L224.51 114.635 L238.707 111.172 L254.433 108.188 L272.064 105.674 L292.189 103.625 L315.831 102.037 L345.048 100.904 L385.405 100.226 L512 100 L638.595 100.226 L678.952 100.904 L708.169 102.037 L731.811 103.625 L751.936 105.674 L769.567 108.188 L785.293 111.172 L799.49 114.635 L812.411 118.586 L824.238 123.036 L835.103 127.998 L845.108 133.487 L854.331 139.524 L862.834 146.13 L870.667 153.333 L877.87 161.166 L884.476 169.669 L890.513 178.892 L896.002 188.897 L900.964 199.762 L905.414 211.589 L909.365 224.51 L912.828 238.707 L915.812 254.433 L918.326 272.064 L920.375 292.189 L921.963 315.831 L923.096 345.048 L923.774 385.405 Z";

const GLYPH_TRANSFORM = "translate(534.466 512) scale(8.6) skewX(-12)";

/**
 * The Spontaneous monolith mark. Same geometry and lighting as
 * brand/spontaneous-mark-monolith.svg, with ids scoped per instance so several
 * marks can share a page without their gradients and filters colliding.
 */
export function SpontaneousMark({ size = 24, className, title = "Spontaneous" }: SpontaneousMarkProps) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `sp-${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;
  const cells = (fill: string) =>
    CELLS.map(([x, y, s, r], i) => <rect key={i} x={x} y={y} width={s} height={s} rx={r} fill={fill} />);

  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      <defs>
        <clipPath id={id("tile")}><path d={TILE} /></clipPath>
        <linearGradient id={id("rim")} gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="924">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={id("bg")} gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="924">
          <stop offset="0" stopColor="#303030" />
          <stop offset="1" stopColor="#060606" />
        </linearGradient>
        <radialGradient id={id("sheen")} gradientUnits="userSpaceOnUse" cx="512" cy="60" r="700">
          <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("face")} gradientUnits="userSpaceOnUse" x1="0" y1="-25" x2="0" y2="25">
          <stop offset="0" stopColor="#fbfbfb" />
          <stop offset="0.55" stopColor="#dedede" />
          <stop offset="1" stopColor="#bdbdbd" />
        </linearGradient>
        <filter id={id("bev")} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5.5" result="b" />
          <feSpecularLighting in="b" surfaceScale="4" specularConstant="1" specularExponent="16" lightingColor="#fff" result="sp">
            <feDistantLight azimuth="250" elevation="42" />
          </feSpecularLighting>
          <feComposite in="sp" in2="SourceAlpha" operator="in" result="spIn" />
          <feColorMatrix in="spIn" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.35 0" result="spA" />
          <feOffset in="SourceAlpha" dx="-2.052" dy="-5.638" result="so" />
          <feComposite in="SourceAlpha" in2="so" operator="out" result="sb" />
          <feGaussianBlur in="sb" stdDeviation="5" result="sbb" />
          <feFlood floodColor="#000" floodOpacity="0.55" />
          <feComposite in2="sbb" operator="in" result="sh0" />
          <feComposite in="sh0" in2="SourceAlpha" operator="in" result="sh" />
          <feOffset in="SourceAlpha" dx="1.026" dy="2.819" result="ro" />
          <feComposite in="SourceAlpha" in2="ro" operator="out" result="rb" />
          <feGaussianBlur in="rb" stdDeviation="1.8" result="rbb" />
          <feFlood floodColor="#fff" floodOpacity="1" />
          <feComposite in2="rbb" operator="in" result="rm0" />
          <feComposite in="rm0" in2="SourceAlpha" operator="in" result="rm" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="sh" />
            <feMergeNode in="rm" />
            <feMergeNode in="spA" />
          </feMerge>
        </filter>
        <filter id={id("drop")} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="20" />
          <feOffset dx="0" dy="26" result="o" />
          <feFlood floodColor="#000" floodOpacity="0.8" />
          <feComposite in2="o" operator="in" />
        </filter>
        <filter id={id("amb")} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="46" />
          <feOffset dx="0" dy="50" result="o" />
          <feFlood floodColor="#000" floodOpacity="0.5" />
          <feComposite in2="o" operator="in" />
        </filter>
      </defs>
      <g clipPath={url("tile")}>
        <rect width="1024" height="1024" fill={url("bg")} />
        <rect width="1024" height="1024" fill={url("sheen")} />
        <g filter={url("amb")}><g transform={GLYPH_TRANSFORM}>{cells("#000")}</g></g>
        <g filter={url("drop")}><g transform={GLYPH_TRANSFORM}>{cells("#000")}</g></g>
        <g filter={url("bev")}><g transform={GLYPH_TRANSFORM}>{cells(url("face"))}</g></g>
        <path d={TILE} fill="none" stroke={url("rim")} strokeWidth="6" />
      </g>
    </svg>
  );
}
