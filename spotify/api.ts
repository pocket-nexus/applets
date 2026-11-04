// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/api.ts — the device's `spotify` service (spotify/contract.ts) and
// the `images` and `glyphs` services, over lib/net.ts.
//
// Every request goes to https://companion.pocket/<service>/…, which
// omarchy-pocketd answers on the device itself. The worker's http node runs
// two requests at a time, so they share one queue here, in order of what a
// reader waits on: player commands first, then pages, then glyph atlases,
// then cover art (the most recently drawn first). At most COVERS_WAITING
// covers wait: past it the one drawn longest ago is dropped, and asked for
// again when a page draws it again. A cover arrives as an IMG entry from the
// images service and becomes a texture; the least recently drawn are freed
// past COVERS_KEPT.
//
// A failure answers a 4xx or 5xx with the contract's Failure; a request
// that never reached the service has the transport's code instead.

import { createSignal } from "solid-js";
import { getOps } from "@pocketjs/framework/host";
import { platform } from "@pocketjs/framework/platform";
import { companionService, fetch, NET_MAX_RESPONSE_BYTES, NetError, type NetResponse } from "../lib/net.ts";
import { GLYPH_ATLAS_URL } from "../ui/glyphs.ts";
import type { AlbumPage, ArtistPage, Device, Failure, Home, Page, Player, PlaylistPage, PlayRequest, Queue, Status } from "./contract.ts";
import { searchPath, withNext } from "./format.ts";

export const MAX_INFLIGHT = 2;
/** Cover textures kept uploaded. */
export const COVERS_KEPT = 72;
/** Cover requests waiting to start: about a full window of covers. */
export const COVERS_WAITING = 32;
/** The texture side the images service is asked for to draw a cover
 *  `logical` px wide: a power of two at least that many samples on this
 *  surface (platform.pixelRatio), at most 256. */
export function coverSide(logical: number): number {
  const want = logical * Math.max(1, platform.pixelRatio);
  let side = 32;
  while (side < want && side < 256) side *= 2;
  return side;
}

/** What a failure lets the applet do (Failure.reason), or what kept the
 *  request from the service: `unavailable` (no service answering), `timeout`. */
export type Reason = Failure["reason"] | "unavailable" | "timeout";

export class SpotifyError extends Error {
  readonly reason: Reason;
  readonly status: number;
  constructor(reason: Reason, message: string, status = 0) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

const REASONS: readonly Reason[] = ["signin", "premium", "nodevice", "rate", "restricted", "conflict", "other"];

/** The order requests leave the queue in. */
const Lane = { command: 0, page: 1, glyphs: 2, cover: 3 } as const;
type Lane = (typeof Lane)[keyof typeof Lane];

interface Task {
  url: string;
  lane: Lane;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
  resolve: (response: NetResponse) => void;
  reject: (error: SpotifyError) => void;
  /** a cover's texture key, while it waits */
  cover?: string;
}

export type Shelf = "playlists" | "albums" | "artists" | "tracks";
export type SearchType = "track" | "album" | "artist" | "playlist";

export interface Covers {
  /** The texture for `url` at `side`, or -1 until it arrives: read
   *  `revision()` to hear of it. `round` cuts a circle (an artist). */
  texture(url: string, side: number, round?: boolean): number;
  revision: () => number;
}

export interface SpotifyClient {
  status(): Promise<Status>;
  /** Start a pairing: the status names its code and URL. */
  signIn(): Promise<Status>;
  signOut(): Promise<Status>;
  /** Forget the pairing waiting for the owner. */
  cancelSignIn(): Promise<Status>;
  home(): Promise<Home>;
  library(shelf: Shelf, next?: string | null): Promise<Page>;
  search(words: string, type: SearchType, next?: string | null): Promise<Page>;
  album(id: string): Promise<AlbumPage>;
  playlist(id: string): Promise<PlaylistPage>;
  artist(id: string): Promise<ArtistPage>;
  tracks(kind: "album" | "playlist", id: string, next: string): Promise<Page>;
  artistAlbums(id: string, next: string): Promise<Page>;
  player(): Promise<Player>;
  devices(): Promise<Device[]>;
  queue(): Promise<Queue>;
  play(request: PlayRequest): Promise<Player>;
  command(name: "pause" | "resume" | "next" | "previous"): Promise<Player>;
  seek(positionMs: number): Promise<Player>;
  volume(percent: number): Promise<Player>;
  shuffle(on: boolean): Promise<Player>;
  repeat(mode: Player["repeat"]): Promise<Player>;
  transfer(deviceId: string, play?: boolean): Promise<Player>;
  like(uri: string, liked: boolean): Promise<{ liked: boolean }>;
  /** A glyph atlas for `face`, in this queue (ui/glyphs.ts GlyphSend). */
  atlas(face: "text" | "bold", body: string): Promise<Uint8Array>;
  covers: Covers;
  /** Requests running now. */
  inflight(): number;
  /** Hears every failure the service answered, before the caller does. */
  onFailure(listener: (error: SpotifyError) => void): void;
}

/** The Failure in an answer's body, when it holds one. */
async function failureOf(response: NetResponse): Promise<SpotifyError> {
  const status = response.status;
  try {
    const body = await response.json<Partial<Failure>>();
    const reason = REASONS.includes(body.reason as Reason) ? (body.reason as Reason) : status === 429 ? "rate" : "other";
    return new SpotifyError(reason, typeof body.error === "string" && body.error ? body.error : `The service answered ${status}.`, status);
  } catch {
    return new SpotifyError(status === 429 ? "rate" : "other", `The service answered ${status}.`, status);
  }
}

export function createSpotifyClient(): SpotifyClient {
  const queue: Task[] = [];
  let running = 0;
  const listeners: ((error: SpotifyError) => void)[] = [];

  const pump = () => {
    while (running < MAX_INFLIGHT && queue.length > 0) {
      const task = queue.shift()!;
      running++;
      fetch(task.url, {
        timeoutMs: task.timeoutMs,
        maxBytes: task.maxBytes,
        ...(task.body !== undefined ? { method: "POST" as const, headers: { "content-type": "application/json" }, body: task.body } : {}),
      }).then(
        async (response) => {
          running--;
          pump();
          if (response.ok) return task.resolve(response);
          const error = await failureOf(response);
          if (task.lane <= Lane.page) for (const listener of listeners) listener(error);
          task.reject(error);
        },
        (error: unknown) => {
          running--;
          pump();
          const code = error instanceof NetError ? error.code : "other";
          const reason: Reason = code === "unavailable" || code === "connect" ? "unavailable" : code === "timeout" ? "timeout" : "other";
          task.reject(new SpotifyError(reason, error instanceof Error ? error.message : String(error)));
        },
      );
    }
  };

  /** Queue a task: a lane's tasks wait behind every earlier lane's; a cover
   *  goes in front of the other covers. */
  const enqueue = (task: Task) => {
    const at = task.lane === Lane.cover ? queue.findIndex((queued) => queued.lane === Lane.cover) : queue.findIndex((queued) => queued.lane > task.lane);
    queue.splice(at < 0 ? queue.length : at, 0, task);
    pump();
  };
  const request = (url: string, lane: Lane, options: { body?: string; timeoutMs?: number; maxBytes?: number; cover?: string } = {}) =>
    new Promise<NetResponse>((resolve, reject) =>
      enqueue({ url, lane, body: options.body, timeoutMs: options.timeoutMs ?? 30_000, maxBytes: options.maxBytes ?? 1024 * 1024, resolve, reject, cover: options.cover }),
    );

  const get = async <T,>(path: string): Promise<T> => (await request(companionService("spotify", path), Lane.page)).json<T>();
  const post = async <T,>(path: string, body: unknown = {}): Promise<T> =>
    (await request(companionService("spotify", path), Lane.command, { body: JSON.stringify(body), timeoutMs: 20_000 })).json<T>();

  // ---- covers --------------------------------------------------------------------
  const textures = new Map<string, number>();
  const asked = new Set<string>();
  const [revision, setRevision] = createSignal(0);
  const covers: Covers = {
    revision,
    texture(url, side, round = false) {
      if (!url) return -1;
      const key = `${side}:${round ? 1 : 0}:${url}`;
      const have = textures.get(key);
      if (have !== undefined) {
        // The most recently drawn are the last to be freed.
        textures.delete(key);
        textures.set(key, have);
        return have;
      }
      if (asked.has(key)) {
        // drawn again while it waits: it goes in front of the other covers
        const at = queue.findIndex((queued) => queued.cover === key);
        if (at >= 0) enqueue(queue.splice(at, 1)[0]!);
        return -1;
      }
      asked.add(key);
      const path = `/fetch?url=${encodeURIComponent(url)}&w=${side}&h=${side}${round ? "&round=1" : ""}`;
      request(companionService("images", path), Lane.cover, { timeoutMs: 30_000, maxBytes: 8 + side * side * 4 + 64, cover: key })
        .then(async (response) => {
          const handle = getOps().uploadImgEntry?.(await response.bytes()) ?? -1;
          if (handle < 0) throw new SpotifyError("other", "The cover did not upload.");
          textures.set(key, handle);
          while (textures.size > COVERS_KEPT) {
            const [oldest, old] = textures.entries().next().value as [string, number];
            textures.delete(oldest);
            asked.delete(oldest);
            getOps().freeTexture?.(old);
          }
          setRevision(revision() + 1);
        })
        // failed, or dropped while it waited: asked again the next time a page draws it
        .catch(() => asked.delete(key));
      // covers are the last lane, so the queue's tail is the cover drawn longest ago
      const first = queue.findIndex((queued) => queued.lane === Lane.cover);
      if (first >= 0 && queue.length - first > COVERS_WAITING) queue.pop()!.reject(new SpotifyError("other", "The cover is no longer drawn."));
      return -1;
    },
  };

  return {
    status: () => get<Status>("/status"),
    signIn: () => post<Status>("/signin"),
    signOut: () => post<Status>("/signout"),
    cancelSignIn: () => post<Status>("/cancel"),
    home: () => get<Home>("/home"),
    library: (shelf, next) => get<Page>(withNext(`/library/${shelf}`, next)),
    search: (words, type, next) => get<Page>(searchPath(words, type, next)),
    album: (id) => get<AlbumPage>(`/album/${encodeURIComponent(id)}`),
    playlist: (id) => get<PlaylistPage>(`/playlist/${encodeURIComponent(id)}`),
    artist: (id) => get<ArtistPage>(`/artist/${encodeURIComponent(id)}`),
    tracks: (kind, id, next) => get<Page>(withNext(`/tracks/${kind}/${encodeURIComponent(id)}`, next)),
    artistAlbums: (id, next) => get<Page>(withNext(`/albums/artist/${encodeURIComponent(id)}`, next)),
    player: () => get<Player>("/player"),
    devices: () => get<Device[]>("/devices"),
    queue: () => get<Queue>("/queue"),
    play: (body) => post<Player>("/play", body),
    command: (name) => post<Player>(`/${name}`),
    seek: (positionMs) => post<Player>("/seek", { positionMs: Math.max(0, Math.round(positionMs)) }),
    volume: (percent) => post<Player>("/volume", { percent: Math.max(0, Math.min(100, Math.round(percent))) }),
    shuffle: (on) => post<Player>("/shuffle", { on }),
    repeat: (mode) => post<Player>("/repeat", { mode }),
    transfer: (deviceId, play) => post<Player>("/transfer", play === undefined ? { deviceId } : { deviceId, play }),
    like: (uri, liked) => post<{ liked: boolean }>("/like", { uri, liked }),
    // The glyphs service reads the face from the body; the query names it
    // too, so sample data can answer each face with its own atlas.
    atlas: async (face, body) => (await request(`${GLYPH_ATLAS_URL}?face=${face}`, Lane.glyphs, { body, timeoutMs: 20_000, maxBytes: NET_MAX_RESPONSE_BYTES })).bytes(),
    covers,
    inflight: () => running,
    onFailure: (listener) => void listeners.push(listener),
  };
}
