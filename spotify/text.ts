// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/text.ts — titles and names in any script. Text in printable ASCII
// (and the separator dot, a literal of the bundle, so the baked faces hold
// it) draws from the baked faces at their sizes; anything else draws from
// the glyph atlases the device renders (ui/glyphs.ts) once they cover it,
// as skeleton bars while they are on their way (ui/skeleton.tsx), and
// folded to ASCII when the glyphs service failed. A page reads
// `faces.revision()` around its layout, so text is laid out again as glyphs
// arrive. Music titles are often Japanese or Chinese.
import { createGlyphs, GLYPH_BOLD, GLYPH_TEXT, richText, type Glyphs } from "../ui/glyphs.ts";
import { skeletonLines } from "../ui/skeleton.tsx";
import { ellipsize, toAscii, wrap } from "../ui/text.ts";
import type { SpotifyClient } from "./api.ts";
import { F } from "./theme.ts";

export interface Faces {
  text: Glyphs;
  bold: Glyphs;
  revision(): number;
}

export function createFaces(client: SpotifyClient): Faces {
  const text = createGlyphs(GLYPH_TEXT, (body) => client.atlas("text", body));
  const bold = createGlyphs(GLYPH_BOLD, (body) => client.atlas("bold", body));
  return { text, bold, revision: () => text.revision() + bold.revision() };
}

const BAKED = /^[\x20-\x7e\n·]*$/;
/** Curly quotes, dashes and ellipses as their ASCII spelling: an atlas glyph
 *  beside baked text looks out of place. */
const typographic = (value: string) =>
  value.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, "\"").replace(/[–—―−]/g, "-").replace(/…/g, "...").replace(/ /g, " ");
const isBold = (slot: number) => slot >= 7 && slot <= 13;

export interface Fitted {
  lines: string[];
  /** The font slot to draw it from. */
  slot: number;
  /** While its glyphs are on their way: each line's width, for skeleton
   *  bars; `lines` are as many empty strings. */
  skeleton?: number[];
}

/** `value` wrapped to `width` in `slot`, at most `maxLines` lines, in the face that can draw it. */
export function fit(faces: Faces, value: string, slot: number, width: number, maxLines = 1): Fitted {
  const clean = typographic(value.replace(/\r/g, ""));
  const one = maxLines === 1;
  if (BAKED.test(clean)) return { lines: one ? [ellipsize(clean.replace(/\n/g, " "), slot, width)] : wrap(clean, slot, width, maxLines), slot };
  const face = isBold(slot) ? faces.bold : faces.text;
  const rich = richText(clean);
  face.want([rich]);
  if (face.covers(rich)) return { lines: one ? [face.ellipsize(rich.replace(/\n/g, " "), width)] : face.wrap(rich, width, maxLines), slot: isBold(slot) ? F.richBold : F.rich };
  if (face.pending(rich)) {
    const skeleton = skeletonLines(one ? rich.replace(/\n/g, " ") : rich, slot, face.face.px, width, maxLines);
    return { lines: skeleton.map(() => ""), slot, skeleton };
  }
  const folded = toAscii(clean);
  return { lines: one ? [ellipsize(folded.replace(/\n/g, " "), slot, width)] : wrap(folded, slot, width, maxLines), slot };
}

/** A page title for the bar, which draws from the baked faces: the name
 *  when they hold it, else what the page is. */
export const barTitle = (name: string, kind: string) => (BAKED.test(name) && name.trim() ? name : kind);
