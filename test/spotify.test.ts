// SPDX-License-Identifier: GPL-3.0-or-later
// test/spotify.test.ts — the Spotify applet's helpers that hold no view:
// lengths, where a playing track is between two answers, paging, failures,
// and its sample data against the contract's shapes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendPage, clock, CLOCK_TRUST_MS, facts, failureText, fractionAt, jumpBackIn, minutesLeft, nextRepeat, progressAt, searchPath, spacedCode, span, withNext } from "../spotify/format.ts";
import type { AlbumPage, ArtistPage, Home, Item, Page, Player, PlaylistPage, Status } from "../spotify/contract.ts";
import { packMock } from "../tools/mock.ts";
import { findRoute } from "../lib/mock.ts";
import { readSetup } from "../ui/setup-state.ts";

const track = (uri: string, durationMs = 200_000): Item => ({ kind: "track", id: uri.split(":").pop()!, uri, title: uri, subtitle: "", image: "", durationMs });

describe("lengths", () => {
  test("a track's length and a position", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(5_400)).toBe("0:05");
    expect(clock(185_000)).toBe("3:05");
    expect(clock(3_723_000)).toBe("1:02:03");
    expect(clock(-10)).toBe("0:00");
    expect(clock(Number.NaN)).toBe("0:00");
  });

  test("an album's length", () => {
    expect(span(0)).toBe("");
    expect(span(20_000)).toBe("1 min");
    expect(span(48 * 60_000)).toBe("48 min");
    expect(span(72 * 60_000)).toBe("1 hr 12 min");
    expect(span(120 * 60_000)).toBe("2 hr");
  });

  test("the facts that are known, between dots", () => {
    expect(facts(["Album", "2024", null, "", false, "12 songs"])).toBe("Album · 2024 · 12 songs");
  });
});

describe("progress between two answers", () => {
  const player = (playing: boolean, progressMs: number, at: number): Pick<Player, "playing" | "progressMs" | "at" | "item"> => ({ playing, progressMs, at, item: track("spotify:track:a", 180_000) });

  test("a playing track moves on from where the service saw it", () => {
    expect(progressAt(player(true, 60_000, 1_000_000), 1_004_500, 1_000_200)).toBe(64_500);
  });

  test("a paused track stays", () => {
    expect(progressAt(player(false, 60_000, 1_000_000), 1_030_000, 1_000_000)).toBe(60_000);
  });

  test("it stops at the track's end", () => {
    expect(progressAt(player(true, 175_000, 1_000_000), 1_020_000, 1_000_000)).toBe(180_000);
    expect(fractionAt(player(true, 175_000, 1_000_000), 1_020_000, 1_000_000)).toBe(1);
  });

  test("a service clock far from the device's gives way to the time since the answer", () => {
    // `at` an hour behind: the answer arrived 3 s ago
    expect(progressAt(player(true, 60_000, 1_000_000 - 3_600_000), 1_003_000, 1_000_000)).toBe(63_000);
    // `at` ahead of the device by more than the slack
    expect(progressAt(player(true, 60_000, 1_000_000 + CLOCK_TRUST_MS), 1_002_000, 1_000_000)).toBe(62_000);
  });

  test("a small skew is not counted backwards", () => {
    expect(progressAt(player(true, 60_000, 1_001_000), 1_000_000, 1_000_000)).toBe(60_000);
  });

  test("nothing to play has no fraction", () => {
    expect(fractionAt({ playing: true, progressMs: 5_000, at: 0, item: null }, 10, 0)).toBe(0);
  });
});

describe("controls", () => {
  test("repeat goes off, the context, the track, off", () => {
    expect(nextRepeat("off")).toBe("context");
    expect(nextRepeat("context")).toBe("track");
    expect(nextRepeat("track")).toBe("off");
  });

  test("a pairing code reads in groups", () => {
    expect(spacedCode("QK7FTM")).toBe("QK7 FTM");
    expect(spacedCode("qk7 ftm")).toBe("QK7 FTM");
    expect(spacedCode("ABCD1234")).toBe("ABCD 1234");
  });

  test("a pairing's time left, in minutes", () => {
    expect(minutesLeft(1_000_000 + 3_599_000, 1_000_000)).toBe("60 min");
    expect(minutesLeft(1_000_000 + 61_000, 1_000_000)).toBe("2 min");
    expect(minutesLeft(1_000_000 + 60_000, 1_000_000)).toBe("1 min");
    expect(minutesLeft(1_000_000 + 59_000, 1_000_000)).toBe("less than a minute");
    expect(minutesLeft(1_000_000, 1_000_000)).toBe("");
  });

  test("failures in the reader's words", () => {
    expect(failureText({ reason: "premium", error: "x" })).toBe("Spotify Premium is needed to play");
    expect(failureText({ reason: "nodevice", error: "x" })).toBe("Nothing is playing anywhere");
    expect(failureText({ reason: "rate", error: "x" })).toBe("Spotify asked to wait a moment");
    expect(failureText({ reason: "restricted", error: "x" })).toBe("That device does not take commands");
    expect(failureText({ reason: "other", error: "The service stopped" })).toBe("The service stopped");
    expect(failureText({ reason: "other", error: "" })).toBe("Spotify did not answer");
  });
});

describe("Jump back in", () => {
  const item = (kind: Item["kind"], id: string): Item => ({ kind, id, uri: `spotify:${kind}:${id}`, title: id, subtitle: "", image: "" });
  const liked: Item = { kind: "liked", id: "", uri: "spotify:user:u:collection", title: "Liked Songs", subtitle: "", image: "" };
  const playlists = [liked, item("playlist", "a"), item("playlist", "b"), item("playlist", "c")];

  test("what was played lately comes first", () => {
    expect(jumpBackIn([item("album", "x"), item("album", "y")], playlists, 4).map((entry) => entry.title)).toEqual(["x", "y", "Liked Songs", "a"]);
  });

  test("with nothing played lately, the playlists fill it, Liked Songs first", () => {
    expect(jumpBackIn([], playlists, 8).map((entry) => entry.title)).toEqual(["Liked Songs", "a", "b", "c"]);
  });

  test("an item in both lists shows once, and the grid holds at most its count", () => {
    expect(jumpBackIn([item("playlist", "a")], playlists, 3).map((entry) => entry.title)).toEqual(["a", "Liked Songs", "b"]);
    expect(jumpBackIn(playlists, playlists, 2).length).toBe(2);
  });
});

describe("paging", () => {
  test("a page token rides as ?next= or &next=", () => {
    expect(withNext("/library/albums", null)).toBe("/library/albums");
    expect(withNext("/library/albums", "o=20&l=20")).toBe("/library/albums?next=o%3D20%26l%3D20");
    expect(withNext("/search?q=a&type=track", "10")).toBe("/search?q=a&type=track&next=10");
  });

  test("search words are encoded, a token added", () => {
    expect(searchPath(" 夜 drive ", "track")).toBe(`/search?q=${encodeURIComponent("夜 drive")}&type=track`);
    expect(searchPath("lo-fi", "album", "10")).toBe("/search?q=lo-fi&type=album&next=10");
  });

  test("a later page adds what is new; a playlist may hold a track twice", () => {
    const album = (id: string): Item => ({ kind: "album", id, uri: `spotify:album:${id}`, title: id, subtitle: "", image: "" });
    const first = [album("a"), album("b")];
    const page: Page = { items: [album("b"), album("c")], total: 3, next: null };
    expect(appendPage(first, page).map((item) => item.id)).toEqual(["a", "b", "c"]);
    const tracks = [track("spotify:track:x"), track("spotify:track:y")];
    expect(appendPage(tracks, { items: [track("spotify:track:x")], total: 3, next: null }).length).toBe(3);
  });
});

describe("the sample data", () => {
  const packed = packMock(join(import.meta.dir, "..", "spotify"));
  if (!packed || Array.isArray(packed)) throw new Error(`spotify/mock does not pack: ${JSON.stringify(packed)}`);
  const json = <T,>(method: string, path: string): T => {
    const route = findRoute(packed.data, method, `https://companion.pocket/spotify${path}`);
    if (!route?.text) throw new Error(`no sample answer for ${method} ${path}`);
    return JSON.parse(route.text) as T;
  };

  test("it fits the store", () => {
    expect(packed.bytes.byteLength).toBeLessThan(4 * 1024 * 1024);
  });

  test("signed in, with something playing on this device's speaker", () => {
    const status = json<Status>("GET", "/status");
    expect([status.signedIn, status.premium, status.speaker.state]).toEqual([true, true, "ready"]);
    const player = json<Player>("GET", "/player");
    expect(player.active && player.device?.local).toBe(true);
  });

  test("home lists Liked Songs first, and every shelf's covers have pictures", () => {
    const home = json<Home>("GET", "/home");
    expect(home.playlists[0]?.kind).toBe("liked");
    const pictures = packed.data.images ?? [];
    for (const item of [...home.recent, ...home.playlists, ...home.albums, ...home.artists]) {
      if (item.image) expect([item.title, pictures.some((picture) => picture.url === item.image)]).toEqual([item.title, true]);
    }
  });

  test("a pairing names its code and spotify.com/pair with the code filled in; no Client ID anywhere", () => {
    const pairing = json<Status>("POST", "/signin");
    expect(pairing.signedIn).toBe(false);
    expect(pairing.signIn?.code).toBe("QK7FTM");
    expect(pairing.signIn?.url).toBe("https://spotify.com/pair?code=QK7FTM");
    expect(findRoute(packed.data, "POST", "https://companion.pocket/spotify/config")).toBe(null);
    const raw = readFileSync(join(import.meta.dir, "..", "spotify", "mock", "mock.json"), "utf8");
    expect(/configured|clientId/.test(raw)).toBe(false);
  });

  test("an artist's page has its popular tracks, the artist's own", () => {
    for (const item of json<Home>("GET", "/home").artists) {
      const artist = json<ArtistPage>("GET", `/artist/${item.id}`);
      expect(artist.top.length).toBeGreaterThan(0);
      expect(artist.top.length).toBeLessThanOrEqual(10);
      expect(artist.top.every((track) => track.kind === "track" && track.artists?.some((ref) => ref.id === item.id))).toBe(true);
    }
  });

  test("the setup of Spotify's own player answers as every companion service's /_setup does", () => {
    const setup = readSetup(json("GET", "/_setup"));
    expect([setup?.service, setup?.ready, setup?.fields[0]?.id, setup?.fields[0]?.set, setup?.tools[0]?.state]).toEqual(["spotify", false, "soloistKey", false, "absent"]);
    expect(setup?.fields[0]?.secret).toBe(true);
    const after = readSetup(json("POST", "/_setup"));
    expect([after?.fields[0]?.set, after?.tools[0]?.state, after?.tools[0]?.consented]).toEqual([true, "fetching", true]);
    const speaker = json<Status>("GET", "/status").speaker;
    expect([speaker.engine, speaker.setup]).toEqual(["librespot", true]);
  });

  test("every POST has an answer", () => {
    for (const path of ["/signin", "/cancel", "/signout", "/_setup", "/play", "/pause", "/resume", "/next", "/previous", "/seek", "/volume", "/shuffle", "/repeat", "/transfer", "/like"]) {
      expect([path, findRoute(packed.data, "POST", `https://companion.pocket/spotify${path}`) !== null]).toEqual([path, true]);
    }
  });

  test("a search answers for any words, a page at a time", () => {
    const first = json<Page>("GET", "/search?q=anything&type=track");
    expect(first.items.length).toBe(10);
    expect(json<Page>("GET", `/search?q=anything&type=track&next=${first.next}`).next).toBe(null);
    for (const type of ["album", "artist", "playlist"]) expect(json<Page>("GET", `/search?q=x&type=${type}`).items.length).toBeGreaterThan(0);
  });

  test("one playlist does not list its tracks, and every item Home opens has its page", () => {
    const home = json<Home>("GET", "/home");
    const playlists = home.playlists.filter((item) => item.kind === "playlist");
    const pages = playlists.map((item) => json<PlaylistPage>("GET", `/playlist/${item.id}`));
    expect(pages.filter((page) => page.tracks === null).map((page) => page.playlist.title)).toEqual(["Kite Season"]);
    for (const item of [...home.recent, ...home.albums]) if (item.kind === "album") expect(json<AlbumPage>("GET", `/album/${item.id}`).album.id).toBe(item.id);
    for (const item of home.artists) expect(json<ArtistPage>("GET", `/artist/${item.id}`).artist.id).toBe(item.id);
  });

  test("nothing in it is a real Spotify picture: every cover is a sample's", () => {
    const raw = readFileSync(join(import.meta.dir, "..", "spotify", "mock", "mock.json"), "utf8");
    const urls = [...raw.matchAll(/"(https:\/\/[^"]+)": "covers\//g)].map((match) => match[1]!);
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.every((url) => url.includes("pocket-sample-"))).toBe(true);
  });
});
