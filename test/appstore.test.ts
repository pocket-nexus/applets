// SPDX-License-Identifier: GPL-3.0-or-later
// test/appstore.test.ts — what the Store's button offers for an app.
import { describe, expect, test } from "bun:test";
import { actionOf, laterVersion, type StoreApp } from "../appstore/api.ts";

const app = (version: string, installed: string | null) => ({ version, installed }) as unknown as StoreApp;

describe("the Store's button", () => {
  test("versions compare as dotted numbers", () => {
    expect(laterVersion("0.10.0", "0.9.2")).toBe(true);
    expect(laterVersion("0.3.0", "0.3.0")).toBe(false);
    expect(laterVersion("0.2.1", "0.3.0")).toBe(false);
    expect(laterVersion("1.0", "0.9.9")).toBe(true);
  });

  test("an update is offered only for a later version; a newer build on the device opens", () => {
    expect(actionOf(app("0.3.0", null), false)).toBe("get");
    expect(actionOf(app("0.3.0", "0.2.0"), false)).toBe("update");
    expect(actionOf(app("0.2.0", "0.3.0"), false)).toBe("open");
    expect(actionOf(app("0.3.0", "0.3.0"), false)).toBe("open");
    expect(actionOf(app("0.3.0", "0.2.0"), true)).toBe("busy");
  });
});
