import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Link preview image in the style of the landing page's closing block:
// night background, the "sunrise" glow with rays at the bottom, the promise in the middle

export const alt = "Личная CRM - помните о людях, которые вам важны.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image renderer does not read CSS, so these repeat the tokens from globals.css
const color = {
  night: "#08081a",
  white: "#fff",
  indigo: "#4b47f2",
  blue: "#3b3ff0",
  violet: "#8a4cf0",
  coral: "#f0564a",
  amber: "#ff8a3d",
  accentNum: "#f07a4a",
  // The transparent end of --glow-sunrise, rgb(40 40 200)
  glowEnd: "#2828c8",
};

const fontsDir = join(process.cwd(), "src/assets/fonts");
const [interTightMedium, interTightSemiBold] = await Promise.all([
  readFile(join(fontsDir, "inter-tight-500.ttf")),
  readFile(join(fontsDir, "inter-tight-600.ttf")),
]);

// --rays from globals.css with the desktop --ray-step: thin wedges fanning out
// from the bottom center. Drawn as SVG, the renderer has no conic gradients
const RAY_STEP_DEG = 6;
const RAY_WIDTH_DEG = 0.25;

function rayWedges(cx: number, cy: number, radius: number) {
  // CSS conic angles: 0deg points up and grows clockwise; "from 270deg" starts pointing left
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(cx + radius * Math.sin(rad)).toFixed(1)} ${(cy - radius * Math.cos(rad)).toFixed(1)}`;
  };
  const wedges = [];
  for (let deg = 270; deg <= 450; deg += RAY_STEP_DEG) {
    wedges.push(`M${cx} ${cy}L${point(deg)}L${point(deg + RAY_WIDTH_DEG)}Z`);
  }
  return wedges.join("");
}

const { width, height } = size;

// --glow-sunrise: an ellipse wider than the image, its bright center just below the bottom edge
const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="sunrise">
      <stop offset="0" stop-color="${color.amber}"/>
      <stop offset="0.22" stop-color="${color.coral}"/>
      <stop offset="0.52" stop-color="${color.violet}"/>
      <stop offset="0.72" stop-color="${color.blue}"/>
      <stop offset="1" stop-color="${color.glowEnd}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${width / 2}" cy="${height + 50}" rx="800" ry="300" fill="url(#sunrise)"/>
  <path d="${rayWedges(width / 2, height, 1400)}" fill="${color.white}" fill-opacity="0.14"/>
</svg>`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: color.night,
          color: color.white,
          fontFamily: "Inter Tight",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not shown in the browser */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(backdrop)}`}
          alt=""
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0 }}
        />

        {/* Logo, as in the header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "56px 64px 0",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              marginRight: 14,
              borderRadius: 8,
              backgroundImage: `linear-gradient(to bottom, ${color.indigo}, ${color.accentNum})`,
            }}
          />
          Личная CRM
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 92,
            fontSize: 84,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.045em",
          }}
        >
          <span>Помните о людях,</span>
          <span>которые вам важны.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter Tight", data: interTightMedium, weight: 500, style: "normal" },
        { name: "Inter Tight", data: interTightSemiBold, weight: 600, style: "normal" },
      ],
    },
  );
}
