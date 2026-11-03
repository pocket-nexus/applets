// SPDX-License-Identifier: GPL-3.0-or-later
// test/setup.test.ts — the owner setup page's words and shapes
// (ui/setup-state.ts), as `/_setup` answers them for any companion service.
import { describe, expect, test } from "bun:test";
import { consentLabel, entryText, progressFraction, progressText, readSetup, shownUrl, sizeText, stepsLeft, toolAction, toolStatus, type SetupToolState } from "../ui/setup-state.ts";

const tool = (state: SetupToolState["state"], extra: Partial<SetupToolState> = {}): SetupToolState => ({
  id: "soloist", title: "Spotify Soloist", vendor: "Spotify", terms: "https://developer.spotify.com/terms", state, consented: false, received: 0, total: 0, fetchedAt: null, message: "", ...extra,
});

describe("an answer of /_setup", () => {
  test("is read into shape, a secret's value never kept", () => {
    const state = readSetup({
      service: "spotify",
      title: "Spotify's own player",
      fields: [{ id: "soloistKey", label: "Soloist API key", secret: true, set: true, value: "leaked" }, { id: "url", label: "URL", secret: false, set: true, value: "https://a" }],
      tools: [{ id: "soloist", title: "Spotify Soloist", vendor: "Spotify", terms: "t", state: "nonsense", received: -4, total: 9 }],
      prompt: { kind: "pick", title: "Pick it" },
      ready: false,
    });
    expect(state?.fields[0]).toEqual({ id: "soloistKey", label: "Soloist API key", secret: true, set: true });
    expect(state?.fields[1]?.value).toBe("https://a");
    expect([state?.tools[0]?.state, state?.tools[0]?.received, state?.tools[0]?.total]).toEqual(["absent", 0, 9]);
    expect(state?.prompt?.kind).toBe("pick");
  });

  test("anything else is not one", () => {
    expect(readSetup(null)).toBe(null);
    expect(readSetup({ fields: [] })).toBe(null);
    expect(readSetup({ fields: [], tools: [], prompt: { kind: "dance", title: "x" } })?.prompt).toBe(null);
  });
});

describe("a tool's row", () => {
  test("its button says it accepts the vendor's terms, and consents", () => {
    expect(consentLabel({ vendor: "Spotify" })).toBe("Accept Spotify's terms and download");
    expect(toolAction(tool("absent"))).toEqual({ label: "Accept Spotify's terms and download", change: { tool: "soloist", consent: true } });
  });

  test("a failure retries the download once consented, else asks for the consent again", () => {
    expect(toolAction(tool("failed", { consented: true }))?.change).toEqual({ tool: "soloist", update: true });
    expect(toolAction(tool("failed"))?.change).toEqual({ tool: "soloist", consent: true });
    expect(toolAction(tool("failed"))?.label).toBe("Retry");
  });

  test("nothing to press while it downloads, once it is ready, or with no build", () => {
    for (const state of ["fetching", "ready", "unavailable"] as const) expect(toolAction(tool(state))).toBe(null);
  });

  test("what it says about where it is", () => {
    expect(toolStatus(tool("fetching", { received: 12_300_000, total: 40_000_000 }))).toBe("Downloading from Spotify: 12.3 of 40.0 MB");
    expect(toolStatus(tool("ready"))).toBe("Ready");
    expect(toolStatus(tool("failed", { message: "Spotify answered 503" }))).toBe("Spotify answered 503");
    expect(toolStatus(tool("unavailable"))).toBe("Spotify publishes no build for this device.");
  });

  test("bytes and progress", () => {
    expect(sizeText(860_000)).toBe("860 KB");
    expect(sizeText(41_200_000)).toBe("41.2 MB");
    expect(progressText(0, 0)).toBe("Starting");
    expect(progressText(2_000_000, 0)).toBe("2.0 MB");
    expect(progressFraction(10, 40)).toBe(0.25);
    expect(progressFraction(10, 0)).toBe(0);
  });
});

describe("a field's entry", () => {
  const key = { id: "k", label: "Soloist API key", secret: true, set: false };
  test("draws dots for a secret being typed, the caret kept", () => {
    expect(entryText(key, "ab|")).toBe("••|");
    expect(entryText({ ...key, secret: false }, "ab|")).toBe("ab|");
  });

  test("once set: dots for a secret, the value for anything else; nothing while unset", () => {
    expect(entryText({ ...key, set: true }, null)).toBe("••••••••••••");
    expect(entryText({ ...key, secret: false, set: true, value: "pocket.local" }, null)).toBe("pocket.local");
    expect(entryText(key, null)).toBe("");
  });
});

describe("the page's words", () => {
  test("steps left count unset fields and tools not ready, optional fields not", () => {
    const state = readSetup({ service: "s", title: "t", fields: [{ id: "a", label: "A", secret: true, set: false }, { id: "b", label: "B", secret: false, set: false, optional: true }], tools: [tool("absent")], prompt: null, ready: false })!;
    expect(stepsLeft(state)).toBe(2);
  });

  test("a URL without its scheme", () => {
    expect(shownUrl("https://developer.spotify.com/terms")).toBe("developer.spotify.com/terms");
    expect(shownUrl("https://spotify.com/pair/")).toBe("spotify.com/pair");
  });
});
