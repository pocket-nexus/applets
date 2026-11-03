// SPDX-License-Identifier: GPL-3.0-or-later
// test/qr.test.ts — kit/qr.ts up to version 20: each version's byte capacity
// at level M (ISO/IEC 18004 table 7), the version a text takes, and a
// symbol's size and its alignment patterns' centres.
import { describe, expect, test } from "bun:test";
import { byteCapacity, dataCodewords, encodeQr, functionModules, QR_MAX_VERSION } from "../kit/qr.ts";

describe("QR codes to version 20", () => {
  test("each version holds the level-M bytes the standard gives it", () => {
    const capacity = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];
    expect(QR_MAX_VERSION).toBe(20);
    expect(Array.from({ length: 20 }, (_, i) => byteCapacity(i + 1))).toEqual(capacity);
    expect(dataCodewords(20)).toBe(669);
  });

  test("a sign-in URL of 489 bytes is a version 17 symbol, 85 modules a side", () => {
    const code = encodeQr("h".repeat(489));
    expect([code.version, code.size, code.modules.length]).toEqual([17, 85, 85]);
  });

  test("past 666 bytes there is no symbol", () => {
    expect(() => encodeQr("h".repeat(667))).toThrow();
  });

  test("version 20's alignment patterns sit at 6, 34, 62 and 90", () => {
    const map = functionModules(20);
    for (const at of [34, 62]) for (const other of [6, 34, 62, 90]) expect([at, other, map[at]![other], map[other]![at]]).toEqual([at, other, true, true]);
  });
});
