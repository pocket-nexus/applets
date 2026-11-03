// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/theme.ts — Spotify's dark palette and the sizes the pages share.
// A page names what a thing is (C.muted, C.raised); the hex values live here.
import type { BarColors } from "../ui/bar.tsx";

export const C = {
  bg: "#121212",
  surface: "#181818",
  raised: "#282828",
  /** A row while pressed or focused. */
  lit: "#2a2a2a",
  line: "#282828",
  text: "#ffffff",
  muted: "#b3b3b3",
  faint: "#727272",
  accent: "#1db954",
  accentLit: "#1ed760",
  /** The track of a progress bar or a volume bar. */
  track: "#4d4d4d",
  /** A cover that has not arrived. */
  placeholder: "#2e2e2e",
  /** A failure's words. */
  red: "#f15e6c",
  /** A skeleton bar in place of text whose glyphs are on their way. */
  skeleton: "#333333",
  shade: "#000000b3",
  white: "#ffffff",
  black: "#000000",
} as const;

/** The bar on every page: the background's colour, white words. */
export const BAR: BarColors = {
  bg: C.bg,
  line: C.bg,
  title: C.text,
  button: C.text,
  lit: C.faint,
  back: "art/spotify/back-white-16.svg",
};

/** Space, in logical px. */
export const S = {
  pad: 12,
  gap: 8,
} as const;

/** Baked font slots (ui/text.ts FONT) and the glyph atlases' (ui/glyphs.ts). */
export const F = {
  small: 0,
  body: 1,
  smallBold: 7,
  bodyBold: 8,
  h3: 9,
  h2: 10,
  h1: 11,
  rich: 21,
  richBold: 22,
} as const;
