#!/usr/bin/env bun
// SPDX-License-Identifier: GPL-3.0-or-later
// bun spotify/mock/make.ts — writes the Spotify applet's sample data:
// mock/mock.json, the service's answers in mock/answers/, cover art drawn by
// ImageMagick (`magick`) in mock/covers/, and two glyph atlases of printable
// ASCII in mock/glyphs/ (PocketJS's baker, Inter), which the store's player
// grows with every other script's glyphs as text needs them.
//
// Every artist, album, track, playlist and person here is made up, and the
// covers are gradients and shapes. The answers follow spotify/contract.ts.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import opentype from "opentype.js";
import { bakeSlot } from "../../vendor/pocketjs/framework/compiler/bake-font.ts";
import { COMPANION_ORIGIN } from "../../lib/net.ts";
import { GLYPH_BOLD, GLYPH_TEXT } from "../../ui/glyphs.ts";
import type { AlbumPage, ArtistPage, Device, Home, Item, Page, Player, PlaylistPage, Queue, Ref, Status } from "../contract.ts";
import type { SetupState } from "../../ui/setup-state.ts";

const DIR = import.meta.dir;
const SERVICE = `${COMPANION_ORIGIN}/spotify`;
const IMAGE = (name: string) => `https://i.scdn.co/image/pocket-sample-${name}`;
const MOSAIC = (name: string) => `https://mosaic.scdn.co/300/pocket-sample-${name}`;
/** The answer's clock: an old moment, so the applet counts the time since the answer arrived. */
const AT = 1_790_000_000_000;

// ---- people and things, all invented ------------------------------------------

const USER = { id: "renarlo", name: "Ren Arlo", image: IMAGE("user-renarlo") };
const LIKED_URI = `spotify:user:${USER.id}:collection`;

const ARTISTS: Record<string, { name: string; colors: [string, string] }> = {
  a1: { name: "Coral Lantern Club", colors: ["#ff8a5b", "#5b2a86"] },
  a2: { name: "Niko Thessaly", colors: ["#3ec7c2", "#1c2b5a"] },
  a3: { name: "Glasshouse Weather", colors: ["#9be15d", "#00a3a3"] },
  a4: { name: "夜光ポスト", colors: ["#20124d", "#e0aaff"] },
  a5: { name: "银河邮差", colors: ["#0f2027", "#2c5364"] },
  a6: { name: "Pine & Parallax", colors: ["#2d6a4f", "#d8f3dc"] },
  a7: { name: "Tin Moth Radio", colors: ["#c9ada7", "#4a4e69"] },
  a8: { name: "Mira Okonkwo-Hale", colors: ["#f9c74f", "#f3722c"] },
  a9: { name: "Small Hours Ensemble", colors: ["#14213d", "#fca311"] },
  a10: { name: "Cobalt Picnic", colors: ["#4361ee", "#caf0f8"] },
};

interface AlbumSpec {
  id: string;
  title: string;
  artists: string[];
  year: string;
  colors: [string, string];
  style: number;
  tracks: [string, number, boolean?][];
}

const m = (minutes: number, seconds: number) => (minutes * 60 + seconds) * 1000;

const ALBUMS: AlbumSpec[] = [
  { id: "al-harbor-lights", title: "Harbor Lights at Low Tide", artists: ["a1"], year: "2024", colors: ["#ff7e5f", "#3a1c71"], style: 4, tracks: [
    ["Lantern Swim", m(3, 42)], ["Breakwater", m(4, 5)], ["Salt in the Radio", m(3, 18)], ["Low Tide Choir", m(4, 51)], ["Gulls Over Pier 9", m(2, 56)],
    ["Night Ferry", m(3, 33), true], ["Anchor Song", m(4, 12)], ["Tidepool Lights", m(3, 7)], ["The Long Wave", m(5, 20)], ["Harbor Lights", m(4, 44)],
  ] },
  { id: "al-paper-satellites", title: "Paper Satellites", artists: ["a2"], year: "2023", colors: ["#43cea2", "#185a9d"], style: 2, tracks: [
    ["Orbit for Two", m(3, 55)], ["Paper Satellites", m(4, 2)], ["Static Hearts", m(3, 21), true], ["Countdown Garden", m(3, 48)],
    ["Weightless Sunday", m(4, 30)], ["Mission Control Lullaby", m(5, 2)], ["Re-entry", m(2, 41)], ["Small Blue Light", m(3, 59)],
  ] },
  { id: "al-condensation", title: "Condensation", artists: ["a3"], year: "2025", colors: ["#a8e063", "#56ab2f"], style: 1, tracks: [
    ["Fogged Glass", m(3, 12)], ["Greenhouse Hymn", m(4, 40)], ["Petrichor Avenue", m(3, 36)], ["Humidity", m(2, 58)],
    ["Seedlings", m(3, 44)], ["Dewpoint", m(4, 9)], ["Cloud Nursery", m(5, 15)],
  ] },
  { id: "al-mayonaka", title: "真夜中の郵便配達", artists: ["a4"], year: "2022", colors: ["#1a0b3d", "#ff6ec7"], style: 3, tracks: [
    ["夜光ポスト", m(3, 50)], ["手紙の雨", m(4, 21)], ["最終列車", m(3, 37)], ["青い切手", m(3, 3)],
    ["月見坂", m(4, 48)], ["おやすみ交差点", m(3, 26)], ["Postmark (Interlude)", m(1, 32)], ["夜明けの配達", m(5, 8)],
  ] },
  { id: "al-xingji", title: "星际慢车", artists: ["a5"], year: "2021", colors: ["#0b132b", "#5bc0be"], style: 0, tracks: [
    ["星际慢车", m(4, 16)], ["银河邮局", m(3, 52)], ["月台上的猫", m(3, 9)], ["慢慢来", m(4, 33)],
    ["北极星信号", m(3, 41)], ["雨夜电台", m(4, 2)], ["Last Stop: 天琴座", m(5, 27)],
  ] },
  { id: "al-coordinates", title: "Coordinates", artists: ["a6"], year: "2020", colors: ["#134e5e", "#71b280"], style: 3, tracks: [
    ["North by Northwest of Here", m(4, 4)], ["Latitude", m(3, 31)], ["Compass Rose", m(3, 58)], ["Parallax Error", m(3, 12), true],
    ["Topography", m(4, 25)], ["Elevation Gain", m(5, 1)],
  ] },
  { id: "al-static-bloom", title: "Static Bloom", artists: ["a7"], year: "2019", colors: ["#e96443", "#904e95"], style: 1, tracks: [
    ["Static Bloom", m(3, 39)], ["Moth Frequencies", m(4, 11)], ["Porchlight", m(3, 3)], ["AM Dial", m(4, 47)],
  ] },
  { id: "al-night-ferry", title: "Night Ferry Sessions", artists: ["a9"], year: "2024", colors: ["#141e30", "#e0a96d"], style: 4, tracks: [
    ["Overture for Deckhands", m(2, 49)], ["Midnight Crossing", m(6, 12)], ["Lighthouse Waltz", m(4, 30)], ["Fog Signal", m(3, 55)], ["Arrival", m(5, 40)],
  ] },
  { id: "al-absolute-zero", title: "Picnic at Absolute Zero", artists: ["a10"], year: "2023", colors: ["#83a4d4", "#b6fbff"], style: 2, tracks: [
    ["Absolute Zero", m(3, 28)], ["Thermos Blues", m(3, 47), true], ["Frost on the Blanket", m(4, 3)], ["Ice Cream Physics", m(2, 52)],
    ["Kelvin", m(3, 35)], ["Snowglobe Party", m(4, 18)],
  ] },
  { id: "al-weather-for-two", title: "Weather for Two", artists: ["a8", "a2"], year: "2025", colors: ["#f7971e", "#ffd200"], style: 0, tracks: [
    ["Weather for Two", m(3, 31)], ["Weather for Two (Acoustic)", m(3, 44)],
  ] },
  { id: "al-lantern-swim-single", title: "Lantern Swim", artists: ["a1"], year: "2023", colors: ["#fc5c7d", "#6a82fb"], style: 2, tracks: [["Lantern Swim", m(3, 42)]] },
  { id: "al-breakwater-live", title: "Breakwater (Live at the Pier)", artists: ["a1"], year: "2024", colors: ["#2c3e50", "#fd746c"], style: 3, tracks: [["Breakwater (Live)", m(5, 2)], ["Anchor Song (Live)", m(4, 40)]] },
];

const ref = (id: string): Ref => ({ id, uri: `spotify:artist:${id}`, name: ARTISTS[id]!.name });

function albumItem(spec: AlbumSpec): Item {
  return {
    kind: "album",
    id: spec.id,
    uri: `spotify:album:${spec.id}`,
    title: spec.title,
    subtitle: spec.artists.map((id) => ARTISTS[id]!.name).join(", "),
    image: IMAGE(`album-${spec.id}`),
    artists: spec.artists.map(ref),
    count: spec.tracks.length,
    year: spec.year,
  };
}

function trackItems(spec: AlbumSpec): Item[] {
  const album = albumItem(spec);
  return spec.tracks.map(([title, durationMs, explicit], index) => ({
    kind: "track",
    id: `${spec.id}-${index + 1}`,
    uri: `spotify:track:${spec.id}-${index + 1}`,
    title,
    subtitle: album.subtitle,
    image: album.image,
    durationMs,
    explicit: explicit === true,
    album: { id: album.id, uri: album.uri, name: album.title },
    artists: album.artists,
    trackNumber: index + 1,
  }));
}

const album = (id: string) => ALBUMS.find((spec) => spec.id === id)!;
const track = (albumId: string, number: number) => trackItems(album(albumId))[number - 1]!;

function artistItem(id: string): Item {
  return { kind: "artist", id, uri: `spotify:artist:${id}`, title: ARTISTS[id]!.name, subtitle: "Artist", image: IMAGE(`artist-${id}`) };
}

interface PlaylistSpec {
  id: string;
  title: string;
  owner: string;
  description: string;
  colors: [string, string];
  style: number;
  mosaic?: boolean;
  /** null: Spotify does not list them to the app */
  tracks: Item[] | null;
  count: number;
}

const LATE_TRAIN = [
  track("al-harbor-lights", 6), track("al-mayonaka", 3), track("al-paper-satellites", 6), track("al-night-ferry", 2), track("al-xingji", 1), track("al-condensation", 7),
  track("al-static-bloom", 3), track("al-coordinates", 1), track("al-mayonaka", 8), track("al-harbor-lights", 9), track("al-weather-for-two", 2), track("al-xingji", 6),
  track("al-night-ferry", 3), track("al-absolute-zero", 3), track("al-paper-satellites", 8), track("al-mayonaka", 5), track("al-condensation", 1), track("al-harbor-lights", 10),
];

const PLAYLISTS: PlaylistSpec[] = [
  { id: "pl-late-train", title: "Late Train Home", owner: USER.name, description: "Quiet songs for the last train out of the city.", colors: ["#232526", "#ff6a88"], style: 4, mosaic: true, tracks: LATE_TRAIN, count: LATE_TRAIN.length },
  { id: "pl-rain-desk", title: "Focus: Rain Desk", owner: USER.name, description: "Instrumental, low and steady. For writing.", colors: ["#3a6073", "#16222a"], style: 1, tracks: [track("al-condensation", 1), track("al-condensation", 4), track("al-night-ferry", 1), track("al-night-ferry", 4), track("al-coordinates", 5), track("al-static-bloom", 2)], count: 6 },
  { id: "pl-city-night", title: "城市夜行", owner: USER.name, description: "夜里走路时听的歌。", colors: ["#0f0c29", "#24c6dc"], style: 3, mosaic: true, tracks: [track("al-xingji", 2), track("al-xingji", 3), track("al-mayonaka", 1), track("al-mayonaka", 2), track("al-xingji", 4), track("al-mayonaka", 6), track("al-xingji", 7)], count: 7 },
  { id: "pl-sunday-pancakes", title: "Sunday Pancakes", owner: USER.name, description: "Breakfast songs. Add yours.", colors: ["#f6d365", "#fda085"], style: 0, tracks: [track("al-weather-for-two", 1), track("al-absolute-zero", 4), track("al-paper-satellites", 5), track("al-coordinates", 3), track("al-absolute-zero", 6)], count: 5 },
  { id: "pl-kite-season", title: "Kite Season", owner: "Harbor FM Curators", description: "Bright, windy indie for the first warm weekend.", colors: ["#56ccf2", "#f2c94c"], style: 2, tracks: null, count: 50 },
  { id: "pl-morning-run", title: "Morning Run 5K", owner: USER.name, description: "Thirty minutes, no slow songs.", colors: ["#ee0979", "#ff6a00"], style: 3, tracks: [track("al-paper-satellites", 3), track("al-coordinates", 4), track("al-absolute-zero", 2), track("al-harbor-lights", 6), track("al-static-bloom", 1), track("al-coordinates", 6)], count: 6 },
];

function playlistItem(spec: PlaylistSpec): Item {
  // a playlist's subtitle names its owner as Spotify's own clients do
  return { kind: "playlist", id: spec.id, uri: `spotify:playlist:${spec.id}`, title: spec.title, subtitle: `By ${spec.owner}`, image: spec.mosaic ? MOSAIC(`playlist-${spec.id}`) : IMAGE(`playlist-${spec.id}`), count: spec.count };
}

const LIKED_TRACKS = [
  ...trackItems(album("al-harbor-lights")).slice(0, 5), ...trackItems(album("al-mayonaka")).slice(0, 4), ...trackItems(album("al-xingji")).slice(0, 3),
  ...trackItems(album("al-paper-satellites")).slice(0, 4), ...trackItems(album("al-weather-for-two")), ...trackItems(album("al-absolute-zero")).slice(0, 3),
  ...trackItems(album("al-condensation")).slice(0, 3), ...trackItems(album("al-coordinates")).slice(0, 4), ...trackItems(album("al-static-bloom")),
  ...trackItems(album("al-night-ferry")).slice(0, 4),
];
const LIKED: Item = { kind: "liked", id: "", uri: LIKED_URI, title: "Liked Songs", subtitle: `${LIKED_TRACKS.length} songs`, image: "", count: LIKED_TRACKS.length };

// ---- the answers --------------------------------------------------------------------

const SPEAKER: Status["speaker"] = { name: "Omarchy Pocket", engine: "librespot", state: "ready", id: "dev-omarchy-pocket", message: "", setup: true };

/** The owner setup of Spotify's own player, as omarchy-pocketd answers /_setup
 *  (PocketJS tools/companion/setup.ts): the key not set, the build not fetched. */
// shown, not fetched
const SOLOIST_DASHBOARD = "https://developer.spotify.com/dashboard/soloist";
// shown, not fetched
const SPOTIFY_TERMS = "https://developer.spotify.com/terms";
const SETUP: SetupState = {
  service: "spotify",
  title: "Spotify's own player",
  fields: [{
    id: "soloistKey",
    label: "Soloist API key",
    secret: true,
    help: "Spotify plays to Soloist where it refuses this device's speaker. Make a key in Spotify's developer dashboard.",
    link: { label: "developer.spotify.com/dashboard/soloist", url: SOLOIST_DASHBOARD },
    set: false,
  }],
  tools: [{
    id: "soloist",
    title: "Spotify Soloist",
    vendor: "Spotify",
    terms: SPOTIFY_TERMS,
    note: "Spotify's headless player, fetched from Spotify for this device and never passed on.",
    state: "absent",
    consented: false,
    received: 0,
    total: 0,
    fetchedAt: null,
    message: "",
  }],
  prompt: null,
  ready: false,
};
/** After a change: the key set, the build on its way from Spotify. */
const SETUP_FETCHING: SetupState = {
  ...SETUP,
  fields: SETUP.fields.map((field) => ({ ...field, set: true })),
  tools: SETUP.tools.map((tool) => ({ ...tool, state: "fetching", consented: true, received: 18_400_000, total: 41_200_000, message: "Fetching Spotify Soloist from Spotify" })),
};
const STATUS: Status = { signedIn: true, user: USER, premium: true, signIn: null, error: "", speaker: SPEAKER };
const SIGNED_OUT: Status = { ...STATUS, signedIn: false, user: null, premium: null, speaker: { ...SPEAKER, state: "off", id: null } };
/** A made-up pairing code, and the page that confirms it with the code filled in. */
const PAIRING_CODE = "QK7FTM";
// shown, not fetched
const PAIRING_URL = `https://spotify.com/pair?code=${PAIRING_CODE}`;
/** A pairing lasts up to an hour; sample data cannot count down, so this one lasts past 2100. */
const PAIRING: Status = { ...SIGNED_OUT, signIn: { url: PAIRING_URL, code: PAIRING_CODE, expiresAt: 4_102_444_800_000 } };

const LOCAL: Device = { id: SPEAKER.id!, name: SPEAKER.name, type: "GameConsole", volume: 64, active: true, local: true, restricted: false };
const DEVICES: Device[] = [
  { id: "dev-ren-phone", name: "Ren's Phone", type: "Smartphone", volume: null, active: false, local: false, restricted: false },
  LOCAL,
  { id: "dev-studio-laptop", name: "Studio Laptop", type: "Computer", volume: 40, active: false, local: false, restricted: false },
  { id: "dev-kitchen-speaker", name: "Kitchen Speaker", type: "Speaker", volume: 30, active: false, local: false, restricted: true },
];

const NOW = track("al-harbor-lights", 1);
const PLAYER: Player = {
  active: true,
  playing: true,
  item: NOW,
  progressMs: 72_000,
  at: AT,
  shuffle: false,
  repeat: "off",
  context: { uri: `spotify:album:al-harbor-lights`, title: "Harbor Lights at Low Tide" },
  device: LOCAL,
  liked: true,
};

const page = (items: Item[], next: string | null = null, total: number | null = items.length): Page => ({ items, total, next });

const RECENT: Item[] = [
  albumItem(album("al-harbor-lights")), playlistItem(PLAYLISTS[0]!), albumItem(album("al-mayonaka")), albumItem(album("al-xingji")),
  playlistItem(PLAYLISTS[2]!), albumItem(album("al-paper-satellites")), track("al-weather-for-two", 1), albumItem(album("al-night-ferry")),
];
const HOME: Home = {
  recent: RECENT,
  playlists: [LIKED, ...PLAYLISTS.map(playlistItem)],
  albums: ALBUMS.slice(0, 8).map(albumItem),
  artists: ["a1", "a2", "a4", "a5", "a3", "a6", "a9", "a10"].map(artistItem),
};

const SAVED_ALBUMS = ALBUMS.slice(0, 10).map(albumItem);
const SEARCH_TRACKS = [track("al-harbor-lights", 1), track("al-mayonaka", 2), track("al-paper-satellites", 1), track("al-xingji", 3), track("al-weather-for-two", 1), track("al-coordinates", 4), track("al-static-bloom", 1), track("al-night-ferry", 2), track("al-absolute-zero", 2), track("al-condensation", 3)];
const SEARCH_MORE = [track("al-harbor-lights", 6), track("al-mayonaka", 5), track("al-xingji", 6), track("al-coordinates", 1), track("al-absolute-zero", 5), track("al-condensation", 2)];

function albumPage(spec: AlbumSpec): AlbumPage {
  return { album: albumItem(spec), tracks: page(trackItems(spec)), liked: ["al-harbor-lights", "al-mayonaka", "al-paper-satellites"].includes(spec.id) };
}

function playlistPage(spec: PlaylistSpec): PlaylistPage {
  const tracks = spec.tracks === null ? null : spec.id === "pl-late-train" ? page(spec.tracks.slice(0, 12), "12", spec.tracks.length) : page(spec.tracks);
  return { playlist: { ...playlistItem(spec), description: spec.description, owner: spec.owner }, tracks };
}

/** An artist's popular tracks: ten of theirs, in an order of their own. */
function popular(id: string): Item[] {
  const all = ALBUMS.filter((spec) => spec.artists.includes(id)).flatMap(trackItems);
  const score = (item: Item) => (item.title.length * 7 + (item.trackNumber ?? 0) * 13) % 17;
  return all.sort((a, b) => score(a) - score(b) || a.uri.localeCompare(b.uri)).slice(0, 10);
}

function artistPage(id: string): ArtistPage {
  const theirs = ALBUMS.filter((spec) => spec.artists.includes(id)).sort((a, b) => b.year.localeCompare(a.year)).map(albumItem);
  return { artist: artistItem(id), top: popular(id), albums: id === "a1" ? page(theirs.slice(0, 2), "2", theirs.length) : page(theirs) };
}

const QUEUE: Queue = { now: NOW, next: [...trackItems(album("al-harbor-lights")).slice(1), track("al-night-ferry", 1)] };

// ---- writing it ---------------------------------------------------------------------

rmSync(join(DIR, "answers"), { recursive: true, force: true });
mkdirSync(join(DIR, "answers"), { recursive: true });
const routes: unknown[] = [];
const answer = (method: string, path: string, file: string, value: unknown) => {
  writeFileSync(join(DIR, "answers", file), `${JSON.stringify(value, null, 1)}\n`);
  routes.push({ ...(method === "GET" ? {} : { method }), url: `${SERVICE}${path}`, file: `answers/${file}` });
};

answer("GET", "/status", "status.json", STATUS);
answer("POST", "/signin", "status-pairing.json", PAIRING);
answer("POST", "/signout", "status-signed-out.json", SIGNED_OUT);
answer("POST", "/cancel", "status-cancelled.json", SIGNED_OUT);
answer("GET", "/home", "home.json", HOME);
answer("GET", "/library/playlists*", "library-playlists.json", page(PLAYLISTS.map(playlistItem)));
answer("GET", "/library/albums?next=*", "library-albums-2.json", page(SAVED_ALBUMS.slice(8), null, SAVED_ALBUMS.length));
answer("GET", "/library/albums", "library-albums.json", page(SAVED_ALBUMS.slice(0, 8), "8", SAVED_ALBUMS.length));
answer("GET", "/library/artists*", "library-artists.json", page(Object.keys(ARTISTS).map(artistItem)));
answer("GET", "/library/tracks?next=*", "library-tracks-2.json", page(LIKED_TRACKS.slice(24), null, LIKED_TRACKS.length));
answer("GET", "/library/tracks", "library-tracks.json", page(LIKED_TRACKS.slice(0, 24), "24", LIKED_TRACKS.length));
answer("GET", "/search?q=*&type=track&next=*", "search-track-2.json", page(SEARCH_MORE, null, 16));
answer("GET", "/search?q=*&type=track", "search-track.json", page(SEARCH_TRACKS, "10", 16));
answer("GET", "/search?q=*&type=album*", "search-album.json", page(ALBUMS.slice(0, 6).map(albumItem), null, 6));
answer("GET", "/search?q=*&type=artist*", "search-artist.json", page(["a1", "a4", "a2", "a5", "a7", "a10"].map(artistItem), null, 6));
answer("GET", "/search?q=*&type=playlist*", "search-playlist.json", page(PLAYLISTS.slice(0, 5).map(playlistItem), null, 5));
for (const spec of ALBUMS) answer("GET", `/album/${spec.id}`, `album-${spec.id}.json`, albumPage(spec));
answer("GET", "/tracks/playlist/pl-late-train?next=*", "playlist-pl-late-train-2.json", page(LATE_TRAIN.slice(12), null, LATE_TRAIN.length));
for (const spec of PLAYLISTS) answer("GET", `/playlist/${spec.id}`, `playlist-${spec.id}.json`, playlistPage(spec));
answer("GET", "/albums/artist/a1?next=*", "artist-a1-2.json", page(ALBUMS.filter((spec) => spec.artists.includes("a1")).sort((a, b) => b.year.localeCompare(a.year)).slice(2).map(albumItem), null, 3));
for (const id of Object.keys(ARTISTS)) answer("GET", `/artist/${id}`, `artist-${id}.json`, artistPage(id));
answer("GET", "/_setup", "setup.json", SETUP);
answer("POST", "/_setup", "setup-fetching.json", SETUP_FETCHING);
answer("GET", "/player", "player.json", PLAYER);
answer("GET", "/devices", "devices.json", DEVICES);
answer("GET", "/queue", "queue.json", QUEUE);
answer("POST", "/pause", "player-paused.json", { ...PLAYER, playing: false });
for (const command of ["resume", "next", "previous", "seek", "volume", "shuffle", "repeat", "transfer", "play"]) routes.push({ method: "POST", url: `${SERVICE}/${command}`, file: "answers/player.json" });
answer("POST", "/like", "like.json", { liked: true });

// ---- glyph atlases: printable ASCII; the player draws the rest ---------------------

mkdirSync(join(DIR, "glyphs"), { recursive: true });
const FONTS = resolve(DIR, "../../vendor/pocketjs/assets/fonts");
const font = (file: string) => opentype.parse(readFileSync(join(FONTS, file)).buffer as ArrayBuffer);
const ascii = Array.from({ length: 95 }, (_, i) => 0x20 + i);
for (const [face, file, spec] of [["text", "Inter-Regular.ttf", GLYPH_TEXT], ["bold", "Inter-Bold.ttf", GLYPH_BOLD]] as const) {
  writeFileSync(join(DIR, "glyphs", `${face}.font`), bakeSlot(font(file), spec.slot, spec.px, spec.bold, ascii, 2).bytes);
  routes.push({ method: "POST", url: `${COMPANION_ORIGIN}/glyphs/atlas?face=${face}`, file: `glyphs/${face}.font`, headers: { "content-type": "application/x-pocket-font" } });
}

// ---- covers: gradients and shapes -----------------------------------------------------

mkdirSync(join(DIR, "covers"), { recursive: true });
const images: Record<string, string> = {};
/** A 256 px cover in one of five looks, from two colours. */
async function cover(name: string, [a, b]: readonly [string, string], style: number, url: string) {
  const out = join(DIR, "covers", `${name}.jpg`);
  const base = ["-size", "256x256"];
  const looks: string[][] = [
    [...base, `gradient:${a}-${b}`, "-fill", "#ffffff38", "-draw", "circle 176,86 176,24", "-fill", "#0000002a", "-draw", "circle 64,204 64,120"],
    [...base, "-seed", String(name.length * 7919 % 1000), `plasma:${a}-${b}`, "-blur", "0x7", "-fill", "#ffffff26", "-draw", "rectangle 0,150 256,168", "-draw", "rectangle 0,188 256,196"],
    [...base, `radial-gradient:${a}-${b}`, "-fill", "none", "-stroke", "#ffffff70", "-strokewidth", "7", "-draw", "circle 128,128 128,36", "-draw", "circle 128,128 128,82"],
    [...base, `gradient:${a}-${b}`, "-stroke", "#ffffff4a", "-strokewidth", "14", "-draw", "line -40,256 216,0", "-draw", "line 40,256 296,0", "-draw", "line 120,256 376,0"],
    [...base, `gradient:${a}-${b}`, "-fill", "#ffd6a5", "-draw", "circle 128,170 128,104", "-fill", b, "-draw", "rectangle 0,170 256,256", "-fill", "#ffffff40", "-draw", "rectangle 0,176 256,180", "-draw", "rectangle 0,196 256,199"],
  ];
  await Bun.$`magick ${looks[style % looks.length]!} -quality 80 ${out}`;
  images[url] = `covers/${name}.jpg`;
}
for (const spec of ALBUMS) await cover(`album-${spec.id}`, spec.colors, spec.style, albumItem(spec).image);
for (const spec of PLAYLISTS) await cover(`playlist-${spec.id}`, spec.colors, spec.style, playlistItem(spec).image);
for (const [id, artist] of Object.entries(ARTISTS)) await cover(`artist-${id}`, artist.colors, 2 + (id.length % 2), IMAGE(`artist-${id}`));
await cover("user-renarlo", ["#1db954", "#191414"], 0, USER.image);

writeFileSync(join(DIR, "mock.json"), `${JSON.stringify({ routes, images }, null, 1)}\n`);
console.log(`${routes.length} routes, ${Object.keys(images).length} pictures`);
