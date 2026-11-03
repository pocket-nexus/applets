#!/usr/bin/env bun
// SPDX-License-Identifier: GPL-3.0-or-later
// bun spotify/icons.gen.ts — writes ui/art/spotify/*.svg, their entries in
// ui/images.json (every applet's images.json links there) and
// spotify/icons.ts. Each icon is geometry on a 24-unit grid, written once per
// colour and drawn size it is used at, so the baker rasterizes it at that
// size (and at the target's density). The SVG baker fills paths and has no
// arcs or strokes: circles are beziers, lines are quads.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { C } from "./theme.ts";

const K = 0.5523;
const n = (v: number) => +v.toFixed(3);
const disc = (x: number, y: number, r: number) =>
  `M${n(x + r)} ${n(y)}C${n(x + r)} ${n(y + K * r)} ${n(x + K * r)} ${n(y + r)} ${n(x)} ${n(y + r)}C${n(x - K * r)} ${n(y + r)} ${n(x - r)} ${n(y + K * r)} ${n(x - r)} ${n(y)}C${n(x - r)} ${n(y - K * r)} ${n(x - K * r)} ${n(y - r)} ${n(x)} ${n(y - r)}C${n(x + K * r)} ${n(y - r)} ${n(x + r)} ${n(y - K * r)} ${n(x + r)} ${n(y)}Z`;
const ring = (x: number, y: number, r: number, t = 2) => disc(x, y, r) + disc(x, y, r - t);
/** A line of width `w` with square ends. */
function line(x0: number, y0: number, x1: number, y1: number, w = 2): string {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const ax = (-dy / l) * (w / 2), ay = (dx / l) * (w / 2);
  return `M${n(x0 + ax)} ${n(y0 + ay)}L${n(x1 + ax)} ${n(y1 + ay)}L${n(x1 - ax)} ${n(y1 - ay)}L${n(x0 - ax)} ${n(y0 - ay)}Z`;
}
/** A polyline of width `w`, its joints rounded by discs. */
const polyline = (points: number[][], w = 2): string[] => [
  ...points.slice(1).map((p, i) => line(points[i]![0]!, points[i]![1]!, p[0]!, p[1]!, w)),
  ...points.slice(1, -1).map((p) => disc(p[0]!, p[1]!, w / 2)),
];
const poly = (...p: number[]) => `M${n(p[0]!)} ${n(p[1]!)}${Array.from({ length: p.length / 2 - 1 }, (_, i) => `L${n(p[2 + i * 2]!)} ${n(p[3 + i * 2]!)}`).join("")}Z`;
/** A rectangle with rounded corners, clockwise; `inner` reverses nothing:
 *  the even-odd rule cuts the hole. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const k = K * r;
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}C${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}C${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}C${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)}V${n(y + r)}C${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)}Z`;
}
const roundRing = (x: number, y: number, w: number, h: number, r: number, t = 2) => roundRect(x, y, w, h, r) + roundRect(x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0.5, r - t));

/** The heart's outline: two lobes and a point, scaled about (12, 12.4). */
function heart(scale: number): string {
  const p = (x: number, y: number) => `${n(12 + (x - 12) * scale)} ${n(12.4 + (y - 12.4) * scale)}`;
  return `M${p(12, 20.6)}C${p(12, 20.6)} ${p(2.6, 14.6)} ${p(2.6, 8.7)}C${p(2.6, 5.7)} ${p(4.9, 3.6)} ${p(7.6, 3.6)}C${p(9.5, 3.6)} ${p(11.1, 4.7)} ${p(12, 6.3)}C${p(12.9, 4.7)} ${p(14.5, 3.6)} ${p(16.4, 3.6)}C${p(19.1, 3.6)} ${p(21.4, 5.7)} ${p(21.4, 8.7)}C${p(21.4, 14.6)} ${p(12, 20.6)} ${p(12, 20.6)}Z`;
}

type Color = "white" | "muted" | "green" | "black";
const COLORS: Record<Color, string> = { white: C.text, muted: C.muted, green: C.accent, black: "#000000" };

/** name -> its shapes and the [colour, size] pairs it is drawn in. */
const ICONS: Record<string, { shapes: string[]; uses: [Color, number][] }> = {
  play: { shapes: [poly(7.5, 4.5, 19.5, 12, 7.5, 19.5)], uses: [["white", 20], ["black", 20], ["black", 24], ["white", 16], ["black", 16]] },
  pause: { shapes: ["M6.5 4.5H10V19.5H6.5Z", "M14 4.5H17.5V19.5H14Z"], uses: [["white", 20], ["black", 20], ["black", 24]] },
  next: { shapes: [poly(5, 4.5, 15.5, 12, 5, 19.5), "M16.5 4.5H19V19.5H16.5Z"], uses: [["white", 20], ["white", 24]] },
  previous: { shapes: [poly(19, 4.5, 8.5, 12, 19, 19.5), "M5 4.5H7.5V19.5H5Z"], uses: [["white", 24]] },
  shuffle: {
    shapes: [
      ...polyline([[2.5, 7], [7, 7], [15, 17], [18.5, 17]]),
      ...polyline([[2.5, 17], [7, 17], [15, 7], [18.5, 7]]),
      poly(17.5, 3.8, 22, 7, 17.5, 10.2),
      poly(17.5, 13.8, 22, 17, 17.5, 20.2),
    ],
    uses: [["white", 20], ["green", 20], ["muted", 20]],
  },
  repeat: {
    shapes: [
      "M3 14V9.5C3 7.6 4.6 6 6.5 6H16V8H6.5C5.7 8 5 8.7 5 9.5V14Z",
      "M21 10V14.5C21 16.4 19.4 18 17.5 18H8V16H17.5C18.3 16 19 15.3 19 14.5V10Z",
      poly(15.5, 3.2, 19.5, 7, 15.5, 10.8),
      poly(8.5, 13.2, 4.5, 17, 8.5, 20.8),
    ],
    uses: [["white", 20], ["green", 20], ["muted", 20]],
  },
  heart: { shapes: [heart(1) + heart(0.78)], uses: [["white", 20], ["muted", 16], ["white", 16]] },
  "heart-fill": { shapes: [heart(1)], uses: [["green", 20], ["green", 16], ["white", 24], ["white", 32]] },
  volume: { shapes: [poly(3, 9, 7, 9, 12, 4.5, 12, 19.5, 7, 15, 3, 15), line(15.5, 9, 15.5, 15), line(19, 6, 19, 18)], uses: [["white", 16], ["muted", 16]] },
  devices: {
    shapes: [roundRing(2, 4, 14, 10, 1.5), "M7 16H11V18H7Z", "M5 18H13V20H5Z", roundRing(17, 7, 5.5, 13, 1.2, 1.8), disc(19.75, 17.4, 0.9)],
    uses: [["white", 20], ["green", 20]],
  },
  queue: { shapes: ["M3 5H16V7H3Z", "M3 10.5H16V12.5H3Z", "M3 16H11V18H3Z", poly(14, 13.5, 21, 17.5, 14, 21.5)], uses: [["white", 20]] },
  back: { shapes: [...polyline([[15, 4.5], [7.5, 12], [15, 19.5]], 2.4)], uses: [["white", 16]] },
  search: { shapes: [ring(10.5, 10.5, 7, 2.4), line(15.6, 15.6, 21, 21, 2.6)], uses: [["black", 16], ["muted", 16]] },
  note: { shapes: [disc(8, 17.5, 3.5), "M10 4H12V17.5H10Z", "M10 4L18 2.5V6.5L12 7.7Z"], uses: [["muted", 24], ["muted", 16]] },
  person: { shapes: [ring(12, 8, 4.5), "M3.5 21C3.5 16.4 7.3 13.5 12 13.5C16.7 13.5 20.5 16.4 20.5 21H18.5C18.5 17.6 15.6 15.5 12 15.5C8.4 15.5 5.5 17.6 5.5 21Z"], uses: [["muted", 24], ["muted", 16]] },
  speaker: { shapes: [roundRing(5, 2, 14, 20, 2.5), ring(12, 15, 3.5, 1.8), disc(12, 7, 1.6)], uses: [["white", 20], ["green", 20]] },
  phone: { shapes: [roundRing(6.5, 2, 11, 20, 2.2), "M10 18.2H14V19.8H10Z"], uses: [["white", 20], ["green", 20]] },
  computer: { shapes: [roundRing(3, 4, 18, 12, 1.5), "M1 18H23V20H1Z"], uses: [["white", 20], ["green", 20]] },
  console: {
    shapes: [roundRing(1.5, 6, 21, 12.5, 4), "M6 10.2H8V14.2H6Z", "M5 11.2H9V13.2H5Z", disc(15.5, 12.8, 1.3), disc(18.2, 10.6, 1.3)],
    uses: [["white", 20], ["green", 20]],
  },
  check: { shapes: [...polyline([[5, 12.5], [10, 17.5], [19.5, 7]], 2.4)], uses: [["green", 16]] },
};

const root = resolve(import.meta.dir, "..");
const art = join(root, "ui", "art", "spotify");
mkdirSync(art, { recursive: true });
for (const file of readdirSync(art)) rmSync(join(art, file));
const rows: string[] = [];
for (const [name, icon] of Object.entries(ICONS)) {
  const entries: string[] = [];
  for (const [color, size] of icon.uses) {
    const file = `${name}-${color}-${size}.svg`;
    const paths = icon.shapes.map((d) => `<path fill="${COLORS[color]}" fill-rule="evenodd" d="${d}"/>`).join("");
    // shown, not fetched: the SVG namespace, no host the applet reaches
    writeFileSync(join(art, file), `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${paths}</svg>\n`);
    entries.push(`${color}${size}: "art/spotify/${file}"`);
  }
  rows.push(`  ${JSON.stringify(name)}: { ${entries.join(", ")} },`);
}
writeFileSync(join(root, "spotify", "icons.ts"), `// SPDX-License-Identifier: GPL-3.0-or-later
// Written by icons.gen.ts. The paths are whole literals because the compiler
// bakes the images a bundle names; each is drawn at the size its key ends in.
export const ICON = {
${rows.join("\n")}
} as const;
`);
// Each icon is sampled linearly; other entries of ui/images.json stay.
const imagesPath = join(root, "ui", "images.json");
const images = Object.fromEntries(Object.entries(JSON.parse(readFileSync(imagesPath, "utf8")) as Record<string, unknown>).filter(([name]) => !name.startsWith("art/spotify/")));
for (const file of readdirSync(art)) images[`art/spotify/${file}`] = { linear: true };
writeFileSync(imagesPath, `${JSON.stringify(Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
console.log(`${rows.length} icons, ${readdirSync(art).length} files`);
