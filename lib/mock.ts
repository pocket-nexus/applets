// SPDX-License-Identifier: GPL-3.0-or-later
// lib/mock.ts — sample data for an applet, answered where every applet
// request goes: its worker's channels (lib/net.ts, lib/net-wire.ts). A host
// that installs createMockWorker's bridge as the realm's worker channel bridge
// (`globalThis.__pocketWorkerChannels`, PocketJS
// framework/src/worker-channels.ts) runs the applet with no device, no worker
// and no network: the store's player in the browser (store/play), tests.
//
// An applet keeps its sample data in mock/mock.json (tools/mock.ts packs it):
//
//   store    the companion store service's documents, by name: what the applet
//            saved on the device (places, a token's absence, settings)
//   routes   requests and their answers, tried in order: a method ("GET" when
//            absent, "*" for any) and a URL with `*` standing for any run of
//            characters, then a status, headers, a delay and a body
//   images   pictures for the images service, by source URL pattern; the
//            host decodes and scales them (hooks.picture)
//
// The bridge keeps the worker's rules (lib/net-worker.ts): at most
// NODE_REQUESTS run at once and the rest wait, an answer is a head, its body in
// records and an end, and one look at the response ring takes at most its
// capacity. The companion's store service answers from `store` and keeps what
// the applet sets for the session. A request nothing answers fails as a
// connection error would, and hooks.request hears of every request, answered
// or not, so an author sees which URLs still need data.

/** The packed form: what the store holds and the player reads. */
export interface MockData {
  mock: 1;
  store?: Record<string, unknown>;
  routes: MockRoute[];
  images?: MockImage[];
}

export interface MockRoute {
  method?: string;
  url: string;
  status?: number;
  headers?: Record<string, string>;
  /** milliseconds before the answer; 60 when absent */
  delay?: number;
  /** the body as text, or as base64 for bytes */
  text?: string;
  base64?: string;
}

export interface MockImage {
  url: string;
  type: string;
  base64: string;
}

/** What a request came to, for the host's log. */
export interface MockRequestNote {
  method: string;
  url: string;
  /** "route", "store", "images" or null when nothing answered */
  answer: "route" | "store" | "images" | null;
  status: number;
}

import { Answer, ANSWER_BYTES, decodeRequest, encodeAnswer, encodeEnd, NET_WORKER, NODE_REQUESTS, Status, text, utf8 } from "./net-wire.ts";

export interface MockHooks {
  /** Every request, when it settles. */
  request?(note: MockRequestNote): void;
  /** A picture for the images service as an IMG entry (framework/compiler/pak.ts)
   *  `w` x `h`, cropped to cover; null when it cannot be made. */
  picture?(source: Uint8Array, type: string, w: number, h: number, round: boolean, alpha: boolean): Promise<Uint8Array | null>;
}

export const MOCK_MAX_BYTES = 4 * 1024 * 1024;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_DELAY = 60;
/** contracts/spec/net.ts: what one response carries. */
const MAX_RESPONSE = 256 * 1024;
const COMPANION = "https://companion.pocket/";

/** The reasons `value` is not packed sample data; empty when it is. */
export function mockErrors(value: unknown): string[] {
  const errors: string[] = [];
  const data = value as Partial<MockData> | null;
  if (!data || typeof data !== "object") return ["sample data is a JSON object"];
  if (data.mock !== 1) errors.push("sample data says mock: 1");
  if (data.store !== undefined && (typeof data.store !== "object" || data.store === null || Array.isArray(data.store))) errors.push("store is an object of documents by name");
  if (!Array.isArray(data.routes)) errors.push("routes is a list");
  for (const [i, route] of (Array.isArray(data.routes) ? data.routes : []).entries()) {
    const at = `routes[${i}]`;
    if (!route || typeof route !== "object") { errors.push(`${at} is an object`); continue; }
    if (typeof route.url !== "string" || !/^https?:\/\//.test(route.url)) errors.push(`${at}.url is an http(s) URL pattern`);
    if (route.method !== undefined && route.method !== "*" && !METHODS.includes(route.method)) errors.push(`${at}.method is one of ${METHODS.join(", ")} or *`);
    if (route.status !== undefined && !(Number.isInteger(route.status) && route.status >= 100 && route.status <= 599)) errors.push(`${at}.status is 100 to 599`);
    if (route.delay !== undefined && !(Number.isFinite(route.delay) && route.delay >= 0 && route.delay <= 30_000)) errors.push(`${at}.delay is 0 to 30000 ms`);
    if (route.text !== undefined && typeof route.text !== "string") errors.push(`${at}.text is a string`);
    if (route.base64 !== undefined && typeof route.base64 !== "string") errors.push(`${at}.base64 is a string`);
    if (route.headers !== undefined && (typeof route.headers !== "object" || Object.values(route.headers).some((v) => typeof v !== "string"))) errors.push(`${at}.headers maps names to strings`);
  }
  if (data.images !== undefined) {
    if (!Array.isArray(data.images)) errors.push("images is a list");
    else for (const [i, image] of data.images.entries()) {
      if (!image || typeof image.url !== "string" || typeof image.base64 !== "string" || typeof image.type !== "string") errors.push(`images[${i}] has url, type and base64`);
    }
  }
  return errors;
}

/** Whether `url` fits `pattern`, where `*` stands for any run of characters. */
export function urlMatches(pattern: string, url: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === url;
  if (!url.startsWith(parts[0]!) || !url.endsWith(parts[parts.length - 1]!)) return false;
  let at = parts[0]!.length;
  const end = url.length - parts[parts.length - 1]!.length;
  for (const part of parts.slice(1, -1)) {
    const found = url.indexOf(part, at);
    if (found < 0 || found + part.length > end) return false;
    at = found + part.length;
  }
  return at <= end;
}

/** The first route for a request, or null. */
export function findRoute(data: MockData, method: string, url: string): MockRoute | null {
  return data.routes.find((r) => (r.method ?? "GET") === method || r.method === "*" ? urlMatches(r.url, url) : false) ?? null;
}

const fromBase64 = (encoded: string): Uint8Array => Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

interface Reply {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  delay: number;
  answer: MockRequestNote["answer"];
}

const REQUEST_ID = 1 + NET_WORKER.channels.findIndex((channel) => channel.name === "request");
const RESPONSE_ID = 1 + NET_WORKER.channels.findIndex((channel) => channel.name === "response");
const RESPONSE_CAPACITY = NET_WORKER.channels[RESPONSE_ID - 1]!.capacity;

/** The worker channel bridge (PocketJS framework/src/worker-channels.ts). */
export interface ChannelBridge {
  configure(id: number, snapshot: number): number;
  publish(id: number, data: Uint8Array): number;
  observe(id: number): Uint8Array[];
}

/** An applet's worker over sample data: `bridge` goes on the realm's
 *  globalThis as `__pocketWorkerChannels` before the bundle evaluates. */
export function createMockWorker(data: MockData, hooks: MockHooks = {}) {
  const encoder = new TextEncoder();
  const store = new Map<string, unknown>(Object.entries(data.store ?? {}));
  const waiting: { id: number; method: string; url: string; body: Uint8Array; maxBytes: number }[] = [];
  let running = 0;
  const outgoing: Uint8Array[] = [];
  const jsonAnswer = (status: number, value: unknown, answer: Reply["answer"]): Reply => ({
    status, headers: { "content-type": "application/json" }, body: encoder.encode(JSON.stringify(value)), delay: 20, answer,
  });

  async function answer(method: string, url: string, body: Uint8Array): Promise<Reply | null> {
    const route = findRoute(data, method, url);
    if (route) {
      return {
        status: route.status ?? 200,
        headers: Object.fromEntries(Object.entries(route.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
        body: route.base64 !== undefined ? fromBase64(route.base64) : encoder.encode(route.text ?? ""),
        delay: route.delay ?? DEFAULT_DELAY,
        answer: "route",
      };
    }
    if (!url.startsWith(COMPANION)) return null;
    const parsed = new URL(url);
    const [service, ...rest] = parsed.pathname.slice(1).split("/");
    const path = `/${rest.join("/")}`;
    const name = parsed.searchParams.get("name") ?? "";
    if (service === "store") {
      if (path === "/get") return jsonAnswer(200, { value: store.get(name) ?? null }, "store");
      if (path === "/set" && method === "POST") {
        try {
          store.set(name, JSON.parse(text(body)));
          return jsonAnswer(200, { ok: true }, "store");
        } catch {
          return jsonAnswer(400, { error: "the value is not JSON" }, "store");
        }
      }
      if (path === "/delete" && method === "POST") return store.delete(name), jsonAnswer(200, { ok: true }, "store");
      if (path === "/list") return jsonAnswer(200, { names: [...store.keys()] }, "store");
      return jsonAnswer(404, { error: `no store endpoint ${path}` }, "store");
    }
    if (service === "images" && path === "/fetch") {
      const source = parsed.searchParams.get("url") ?? "";
      const image = data.images?.find((i) => urlMatches(i.url, source));
      const w = Number(parsed.searchParams.get("w")), h = Number(parsed.searchParams.get("h"));
      const round = parsed.searchParams.get("round") === "1" && w === h;
      const entry = image && hooks.picture ? await hooks.picture(fromBase64(image.base64), image.type, w, h, round, round || parsed.searchParams.get("alpha") === "1") : null;
      if (!entry) return jsonAnswer(404, { error: "no sample picture for that url" }, "images");
      return { status: 200, headers: { "content-type": "application/x-pocket-img" }, body: entry, delay: 40, answer: "images" };
    }
    return null;
  }

  const queue = (id: number, kind: number, payload: Uint8Array) => {
    let at = 0;
    do {
      outgoing.push(encodeAnswer(id, kind, payload.subarray(at, at + ANSWER_BYTES)));
      at += ANSWER_BYTES;
    } while (at < payload.length);
  };
  const end = (id: number, status: number, failure = "") => queue(id, Answer.end, encodeEnd(status, failure));

  const start = () => {
    while (running < NODE_REQUESTS && waiting.length > 0) {
      const request = waiting.shift()!;
      running++;
      void answer(request.method, request.url, request.body).then((found) => {
        setTimeout(() => {
          running--;
          const { id, method, url } = request;
          if (!found) {
            hooks.request?.({ method, url, answer: null, status: 0 });
            end(id, Status.failed, `connect: no sample data for ${method} ${url}`);
          } else {
            hooks.request?.({ method, url, answer: found.answer, status: found.status });
            if (found.body.byteLength > request.maxBytes) end(id, Status.failed, `response_too_large: the body is over ${request.maxBytes} bytes`);
            else {
              queue(id, Answer.head, utf8(JSON.stringify({ status: found.status, url, headers: found.headers })));
              if (found.body.byteLength > 0) queue(id, Answer.body, found.body);
              end(id, Status.ok);
            }
          }
          start();
        }, found?.delay ?? DEFAULT_DELAY);
      });
    }
  };

  const bridge: ChannelBridge = {
    configure: () => Status.ok,
    publish(channel, record) {
      if (channel !== REQUEST_ID) return Status.invalid;
      const { id, descriptor } = decodeRequest(record.slice());
      const method = descriptor.method ?? "GET";
      if (!/^https?:\/\/[^\s/]+/.test(descriptor.url) || !METHODS.includes(method)) {
        end(id, Status.invalid, "invalid_request: url must be absolute HTTP(S) and the method one of " + METHODS.join(", "));
        return Status.ok;
      }
      const maxBytes = Math.min(descriptor.maxBytes ?? 128 * 1024, MAX_RESPONSE);
      waiting.push({ id, method, url: descriptor.url, body: utf8(descriptor.body ?? ""), maxBytes });
      start();
      return Status.ok;
    },
    observe(channel) {
      if (channel !== RESPONSE_ID) return [];
      return outgoing.splice(0, RESPONSE_CAPACITY);
    },
  };
  return {
    bridge,
    /** The store service's documents now, with what the applet set. */
    store: () => Object.fromEntries(store),
  };
}
