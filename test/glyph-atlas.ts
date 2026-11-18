// SPDX-License-Identifier: GPL-3.0-or-later
// test/glyph-atlas.ts — the atlas the companion's glyphs service answers, for
// test/net.test.ts: the cell of a face at a size, the tofu box and the FONT
// ATLAS v3 packer. lib/glyphs.ts merges such atlases (mergeAtlases), and the
// test compares its result with one packed here.
//
// These are the helpers of PocketJS's tools/companion/glyphs.ts as of
// b5aff674 (MIT, Copyright (c) 2026 Yifeng "Evan" Wang; the notice is
// PocketJS's LICENSE, vendor/pocket-shell/vendor/pocketjs/LICENSE), with the
// agent's default font and slot taken out: PocketJS removed tools/companion
// after that commit, and the service that packs atlases is not in a
// repository this one builds on.

import { FONT_CMAP_ENTRY_SIZE, FONT_HEADER_SIZE, FONT_MAGIC, FONT_VERSION } from "../vendor/pocket-shell/vendor/pocketjs/contracts/spec/spec.ts";

export interface AtlasFont {
  size: number;
  cellW: number;
  cellH: number;
  baseline: number;
  lineHeight: number;
}

/** The cell for a face at `px` logical pixels (cellW px+2, cellH px*1.4,
 *  baseline px*1.08, line px*1.3). */
export function atlasFont(px: number): AtlasFont {
  return {
    size: px,
    cellW: px + 2,
    cellH: Math.ceil(px * 1.4),
    baseline: Math.round(px * 1.08),
    lineHeight: Math.round(px * 1.3),
  };
}

export interface GlyphCell {
  advance: number;
  xoff: number;
  /** cellW x cellH alpha bytes, top row first. */
  coverage: Uint8Array;
}

/** gid 0: an outlined box, the width of a CJK glyph's ink. */
export function tofuCell(font: AtlasFont): GlyphCell {
  const coverage = new Uint8Array(font.cellW * font.cellH);
  const left = 1;
  const right = Math.min(font.cellW - 2, font.size - 2);
  const top = Math.max(0, font.baseline - font.size + 2);
  const bottom = font.baseline;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (y === top || y === bottom || x === left || x === right) coverage[y * font.cellW + x] = 200;
    }
  }
  return { advance: Math.min(font.cellW, font.size), xoff: 0, coverage };
}

/** The codepoint the tofu box answers to, as PocketJS's bake-font.ts maps it. */
export const TOFU_CODEPOINT = 0xfffd;

/** A FONT ATLAS v3 blob: gid 0 the tofu box (mapped from U+FFFD), then
 *  `cells`; one cmap entry per glyph, sorted by codepoint. A null cell (no
 *  font draws it) is left to the tofu box. `bold` sets the bold flag. */
export function packAtlas(cells: ReadonlyMap<number, GlyphCell | null>, font: AtlasFont, slot: number, bold: boolean): Uint8Array {
  const codepoints = [...cells.keys()].filter((cp) => cp !== TOFU_CODEPOINT && cells.get(cp)).sort((a, b) => a - b);
  const count = codepoints.length + 1;
  if (count > 0xffff) throw new Error("atlas: too many glyphs");
  const cellBytes = font.cellW * font.cellH;
  const coverageOffset = FONT_HEADER_SIZE + count * FONT_CMAP_ENTRY_SIZE;
  const out = new Uint8Array(coverageOffset + count * cellBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, FONT_MAGIC, true);
  view.setUint16(4, FONT_VERSION, true);
  view.setUint16(6, count, true);
  out[8] = font.cellW;
  out[9] = font.cellH;
  out[10] = font.baseline;
  out[11] = font.lineHeight;
  out[12] = slot;
  out[13] = bold ? 1 : 0; // flags: bold
  out[14] = 1; // density
  out[15] = 0;
  const tofu = tofuCell(font);
  out.set(tofu.coverage, coverageOffset);
  const entries = codepoints.map((cp, index) => ({ cp, gid: index + 1, cell: cells.get(cp)! }));
  entries.push({ cp: TOFU_CODEPOINT, gid: 0, cell: tofu });
  entries.sort((a, b) => a.cp - b.cp);
  entries.forEach(({ cp, gid, cell }, index) => {
    const entry = FONT_HEADER_SIZE + index * FONT_CMAP_ENTRY_SIZE;
    view.setUint32(entry, cp, true);
    view.setUint16(entry + 4, gid, true);
    out[entry + 6] = Math.max(0, Math.min(255, cell.advance));
    out[entry + 7] = Math.max(0, Math.min(255, cell.xoff));
    if (gid > 0) out.set(cell.coverage.subarray(0, cellBytes), coverageOffset + gid * cellBytes);
  });
  return out;
}
