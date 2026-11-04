// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/format.ts — what the pages say about time and paging, apart from any
// view: a track's length, an album's, where a playing track is now, the next
// repeat mode, a path with its page token, and the words for a failure.
import type { Failure, Item, Page, Player } from "./contract.ts";

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** A track's length or a position: "3:05", "1:02:03"; "0:00" for nothing. */
export function clock(ms: number): string {
  const whole = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const s = whole % 60, m = Math.floor(whole / 60) % 60, h = Math.floor(whole / 3600);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Many tracks' length: "48 min", "1 hr 12 min", "" for nothing. */
export function span(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60000);
  if (minutes === 0) return ms > 0 ? "1 min" : "";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "1 song", "12 songs". */
export const songs = (count: number) => `${count} ${count === 1 ? "song" : "songs"}`;

/** Elapsed time from the service's clock, trusted while it is at most this
 *  far from the device's: past it (a clock set wrong, an answer replayed)
 *  the time since the answer arrived stands in. */
export const CLOCK_TRUST_MS = 60_000;

/** Where the playing item is at `now`: the service's position at `at`, plus
 *  the time since while it plays, within the item's length. `receivedAt` is
 *  when the answer arrived, by the same clock as `now`. */
export function progressAt(player: Pick<Player, "playing" | "progressMs" | "at" | "item">, now: number, receivedAt: number): number {
  const length = player.item?.durationMs ?? 0;
  let position = Math.max(0, player.progressMs);
  if (player.playing) {
    const sinceAt = now - player.at;
    position += sinceAt >= -2000 && sinceAt <= CLOCK_TRUST_MS ? Math.max(0, sinceAt) : Math.max(0, now - receivedAt);
  }
  return length > 0 ? Math.min(position, length) : position;
}

/** `progressAt` as a fraction of the item's length, 0 without one. */
export function fractionAt(player: Pick<Player, "playing" | "progressMs" | "at" | "item">, now: number, receivedAt: number): number {
  const length = player.item?.durationMs ?? 0;
  return length > 0 ? progressAt(player, now, receivedAt) / length : 0;
}

/** Off, then the album or playlist, then the one track, then off. */
export function nextRepeat(mode: Player["repeat"]): Player["repeat"] {
  return mode === "off" ? "context" : mode === "context" ? "track" : "off";
}

/** `path` asking for the page after `next`; `path` itself for the first. */
export function withNext(path: string, next: string | null | undefined): string {
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}

/** The search path for words, a kind and a page token. */
export function searchPath(words: string, type: "track" | "album" | "artist" | "playlist", next?: string | null): string {
  return withNext(`/search?q=${encodeURIComponent(words.trim())}&type=${type}`, next);
}

/** A page's items after `before`, each item once (by its uri and place
 *  for tracks, which a playlist may hold twice: by the uri for the rest). */
export function appendPage(before: readonly Item[], page: Page): Item[] {
  const seen = new Set(before.map((item, index) => keyOf(item, index)));
  const out = [...before];
  for (const item of page.items) {
    const key = keyOf(item, out.length);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const keyOf = (item: Item, index: number) => (item.kind === "track" || item.kind === "episode" ? `${item.uri}#${index}` : item.uri);

/** "Album · 2024 · 12 songs, 48 min" and its like: the facts that are known. */
export function facts(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => !!part).join(" · ");
}

/** The sentence a reader sees for a failure the service named. */
export function failureText(failure: { reason: Failure["reason"] | string; error: string }): string {
  switch (failure.reason) {
    case "premium":
      return "Spotify Premium is needed to play";
    case "nodevice":
      return "Nothing is playing anywhere";
    case "rate":
      return "Spotify asked to wait a moment";
    case "restricted":
      return "That device does not take commands";
    case "conflict":
      return "Another Spotify account is playing on this device";
    case "signin":
      return "Sign in to Spotify again";
    default:
      return failure.error || "Spotify did not answer";
  }
}

/** A pairing's time left in whole minutes: "60 min", "1 min", "less than a
 *  minute"; "" once it has passed. A pairing lasts up to an hour. */
export function minutesLeft(expiresAt: number, now: number): string {
  const left = expiresAt - now;
  if (left <= 0) return "";
  if (left < 60_000) return "less than a minute";
  return `${Math.ceil(left / 60_000)} min`;
}

/** A pairing code in groups for reading and typing, upper case: "QK7FTM"
 *  as "QK7 FTM", an 8-character one in fours. */
export function spacedCode(code: string): string {
  const plain = code.replace(/\s+/g, "").toUpperCase();
  const size = plain.length === 6 || plain.length === 9 ? 3 : 4;
  const groups: string[] = [];
  for (let at = 0; at < plain.length; at += size) groups.push(plain.slice(at, at + size));
  return groups.join(" ");
}

/** Home's "Jump back in" grid: what was played lately, then the playlists
 *  (Liked Songs first) it does not hold, `count` in all. */
export function jumpBackIn(recent: readonly Item[], playlists: readonly Item[], count: number): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const item of [...recent, ...playlists]) {
    if (out.length >= count) break;
    if (seen.has(item.uri)) continue;
    seen.add(item.uri);
    out.push(item);
  }
  return out;
}
