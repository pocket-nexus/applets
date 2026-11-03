// SPDX-License-Identifier: GPL-3.0-or-later
// test/images.test.ts — pictures that become textures: the kit's cache
// (kit/images.ts) and the Spotify applet's covers (spotify/api.ts). The
// worker's fetch is stood in for by requests this file answers by hand, and
// the host's ops by a counter of texture handles.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { getHost, installHost, type Host, type HostOps } from "@pocketjs/framework/host";
import * as net from "../lib/net.ts";

interface Asked {
  /** the picture's own URL, from the images service's `?url=` */
  url: string;
  answer(status?: number): void;
  fail(): void;
}

const realFetch = net.fetch;
let asked: Asked[] | null = null;
const fakeFetch = (url: string, options?: net.FetchOptions): Promise<net.NetResponse> => {
  if (!asked) return realFetch(url, options);
  const list = asked;
  return new Promise((resolve, reject) => {
    const picture = new URL(url).searchParams.get("url") ?? "";
    list.push({
      url: picture,
      answer: (status = 200) => resolve(new net.NetResponse(status, url, {}, new TextEncoder().encode(picture))),
      fail: () => reject(new net.NetError("connect", "no route")),
    });
  });
};
mock.module("../lib/net.ts", () => ({ ...net, fetch: fakeFetch }));
mock.module("../kit/platform.tsx", () => ({ companionService: net.companionService, fetch: fakeFetch }));

let handles = 0;
const freed: number[] = [];
/** pictures whose upload fails */
const refused = new Set<string>();
const ops = {
  uploadImgEntry: (bytes: Uint8Array) => (refused.has(new TextDecoder().decode(bytes)) ? -1 : ++handles),
  freeTexture: (handle: number) => void freed.push(handle),
} as unknown as HostOps;
let before: Host | null = null;

beforeAll(() => {
  try {
    before = getHost();
  } catch {
    before = null;
  }
  installHost({ ops, kind: "injected", target: "test", strict: true });
});
afterAll(() => {
  asked = null;
  if (before) installHost(before);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Answer every request, the oldest first, until none is out; the pictures in the order they were fetched. */
async function answerAll(list: Asked[]): Promise<string[]> {
  const order: string[] = [];
  while (list.length > 0) {
    const next = list.shift()!;
    order.push(next.url);
    next.answer();
    await settle();
  }
  return order;
}
const url = (n: number) => `https://i.example/${n}`;

describe("the kit's images", () => {
  test("a picture freed past the limit is fetched again the next time it is drawn", async () => {
    const { createImages } = await import("../kit/images.ts");
    const list: Asked[] = (asked = []);
    const images = createImages();
    // one more than the 64 kept
    for (let n = 0; n <= 64; n++) images.texture(url(n), 32);
    await answerAll(list);
    expect(freed.length).toBe(1);
    expect(images.texture(url(64), 32)).toBeGreaterThan(0);
    // the first was freed; drawn again, it is fetched again
    expect(images.texture(url(0), 32)).toBe(-1);
    expect(list.map((entry) => entry.url)).toEqual([url(0)]);
    await answerAll(list);
    expect(images.texture(url(0), 32)).toBeGreaterThan(0);
  });
});

describe("Spotify's covers", () => {
  test("at most COVERS_WAITING wait, the most recently drawn first; the one drawn longest ago is dropped and asked for again when drawn", async () => {
    const { COVERS_WAITING, MAX_INFLIGHT, createSpotifyClient } = await import("../spotify/api.ts");
    const list: Asked[] = (asked = []);
    const { covers } = createSpotifyClient();
    // two start; COVERS_WAITING wait; one more pushes out the first that waits
    const count = MAX_INFLIGHT + COVERS_WAITING + 1;
    for (let n = 0; n < count; n++) expect(covers.texture(url(n), 64)).toBe(-1);
    expect(list.map((entry) => entry.url)).toEqual([url(0), url(1)]);
    const dropped = url(MAX_INFLIGHT);
    await settle();
    // drawn again while it waits: it goes first
    const again = url(MAX_INFLIGHT + 3);
    covers.texture(again, 64);
    const order = await answerAll(list);
    expect(order.slice(0, 3)).toEqual([url(0), url(1), again]);
    expect(order[3]).toBe(url(count - 1));
    expect(order).not.toContain(dropped);
    expect(order.length).toBe(count - 1);
    // the dropped one is asked for again once a page draws it
    expect(covers.texture(dropped, 64)).toBe(-1);
    expect(await answerAll(list)).toEqual([dropped]);
    expect(covers.texture(dropped, 64)).toBeGreaterThan(0);
  });

  test("a cover whose upload failed is asked for again", async () => {
    const { createSpotifyClient } = await import("../spotify/api.ts");
    const list: Asked[] = (asked = []);
    const { covers } = createSpotifyClient();
    refused.add(url(200));
    covers.texture(url(200), 64);
    await answerAll(list);
    refused.delete(url(200));
    expect(covers.texture(url(200), 64)).toBe(-1);
    expect(await answerAll(list)).toEqual([url(200)]);
    expect(covers.texture(url(200), 64)).toBeGreaterThan(0);
  });
});
