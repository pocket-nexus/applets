// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/contract.ts — what the `spotify` service answers. omarchy-pocketd
// implements it on Omarchy Pocket (daemon/spotify.ts in
// pocket-nexus/omarchy-pocket, which imports this file through its
// vendor/applets submodule); the applet's sample data (spotify/mock/) answers
// it in the store's player. Every path is under companionService("spotify").
//
// The service holds the Spotify sign-in (a pairing code the owner confirms
// at spotify.com/pair, as a TV signs in; no credential reaches the applet),
// answers from Spotify's own internal API in the compact objects below, and
// is this device's Spotify Connect speaker. A request answers JSON; a failure
// answers a 4xx or 5xx with `Failure`.
//
//   GET  /status                       Status
//   POST /signin                       Status     start a pairing: status.signIn has its code and URL
//   POST /cancel                       Status     forget the pairing waiting for the owner
//   POST /signout                      Status
//   GET  /home                         Home
//   GET  /library/<shelf>?next=<t>     Page       shelf: playlists | albums | artists | tracks
//   GET  /search?q=<q>&type=<t>&next=  Page       type: track | album | artist | playlist
//   GET  /album/<id>                   AlbumPage
//   GET  /playlist/<id>                PlaylistPage
//   GET  /artist/<id>                  ArtistPage
//   GET  /tracks/<kind>/<id>?next=<t>  Page       kind: album | playlist; the next page of a page's tracks
//   GET  /albums/artist/<id>?next=<t>  Page       the next page of an artist's albums
//   GET  /player                       Player
//   GET  /devices                      Device[]
//   GET  /queue                        Queue
//   POST /play       PlayRequest       Player
//   POST /pause | /resume | /next | /previous   Player
//   POST /seek       {positionMs}      Player
//   POST /volume     {percent}         Player
//   POST /shuffle    {on}              Player
//   POST /repeat     {mode}            Player
//   POST /transfer   {deviceId, play?} Player
//   POST /like       {uri, liked}      {liked}
//   GET|POST /_setup                   PocketJS SetupState: Spotify's own player
//                                      (the owner setup every companion service
//                                      answers the same way, tools/companion/setup.ts)
//
// Cover art is an https URL (i.scdn.co, mosaic.scdn.co, image-cdn-*.spotifycdn.com)
// for the `images` service. A page's `next` is an opaque token: pass it back
// as ?next= for the following page; null when there is none.

export type Kind = "track" | "album" | "playlist" | "artist" | "liked" | "episode";

export interface Ref {
  id: string;
  uri: string;
  name: string;
}

/** Anything a list row shows. */
export interface Item {
  kind: Kind;
  /** Spotify's id; "" for Liked Songs */
  id: string;
  /** spotify:track:…, spotify:album:…; Liked Songs is spotify:user:<user>:collection */
  uri: string;
  title: string;
  /** a track's or an album's artists, a playlist's owner, "Artist", "Playlist" */
  subtitle: string;
  /** cover art near 300 px, or "" */
  image: string;
  /** tracks and episodes */
  durationMs?: number;
  explicit?: boolean;
  /** a track's album */
  album?: Ref;
  /** a track's or an album's artists */
  artists?: Ref[];
  /** a track's place on its album, from 1 */
  trackNumber?: number;
  /** an album's or a playlist's number of tracks */
  count?: number;
  /** an album's release year */
  year?: string;
  /** false when Spotify cannot play it here */
  playable?: boolean;
}

export interface Page {
  items: Item[];
  /** how many there are in all, when Spotify says */
  total: number | null;
  next: string | null;
}

export interface Status {
  signedIn: boolean;
  user: { id: string; name: string; image: string } | null;
  /** the account has Premium; null until Spotify says. Playing needs it */
  premium: boolean | null;
  /** a pairing waiting for the owner: `url` (spotify.com/pair with the code
   *  filled in) as a QR code, and `code` large, for spotify.com/pair typed on
   *  any phone or computer */
  signIn: { url: string; code: string; expiresAt: number } | null;
  /** why the last sign-in or the session failed, for the reader */
  error: string;
  /** this device's Spotify Connect speaker */
  speaker: {
    name: string;
    /** librespot, or Spotify's own player (Soloist) once the owner set it up */
    engine: "librespot" | "soloist";
    /** off: not signed in; starting; ready: in the account's devices;
     *  refused: Spotify sends librespot no audio keys for this account, so
     *  nothing plays until Soloist is set up (/_setup); pair: Soloist waits
     *  for the owner to pick it once in Spotify on a phone on this network;
     *  error: see message */
    state: "off" | "starting" | "ready" | "refused" | "pair" | "error";
    /** its Connect device id */
    id: string | null;
    message: string;
    /** the owner setup at /_setup is not complete */
    setup: boolean;
  };
}

export interface Home {
  /** what was played lately, its album or playlist where it had one, newest first, at most 12 */
  recent: Item[];
  /** Liked Songs first, then the owner's playlists, at most 20 */
  playlists: Item[];
  /** saved albums, at most 12 */
  albums: Item[];
  /** followed artists, at most 12 */
  artists: Item[];
}

export interface AlbumPage {
  album: Item;
  tracks: Page;
  liked: boolean;
}

export interface PlaylistPage {
  playlist: Item & { description: string; owner: string };
  /** null when Spotify does not list this playlist's tracks: it still plays */
  tracks: Page | null;
}

export interface ArtistPage {
  artist: Item;
  /** the artist's popular tracks, at most 10 */
  top: Item[];
  /** albums and singles, newest first */
  albums: Page;
}

export interface Device {
  id: string;
  name: string;
  /** Computer, Smartphone, Speaker, GameConsole, … as Spotify names it */
  type: string;
  /** 0–100, null when it cannot be set */
  volume: number | null;
  active: boolean;
  /** this device's own speaker (librespot, or Spotify's Soloist) */
  local: boolean;
  /** Spotify refuses commands to it */
  restricted: boolean;
}

export interface Player {
  /** something is playing or paused on some device */
  active: boolean;
  playing: boolean;
  item: Item | null;
  progressMs: number;
  /** the service's Date.now() when progressMs was true: the applet adds the time since while playing */
  at: number;
  shuffle: boolean;
  repeat: "off" | "context" | "track";
  /** the album, playlist or artist playing, when there is one */
  context: { uri: string; title: string } | null;
  device: Device | null;
  /** the item is in Liked Songs */
  liked: boolean;
}

export interface Queue {
  now: Item | null;
  next: Item[];
}

export interface PlayRequest {
  /** an album, playlist or artist uri, or Liked Songs' */
  context?: string;
  /** tracks to play, when there is no context */
  uris?: string[];
  /** where in the context to start: a track's uri or its place from 0 */
  offset?: { uri?: string; position?: number };
  positionMs?: number;
  /** where to play; absent: this device's own speaker, whatever else is active */
  deviceId?: string;
}

export interface Failure {
  error: string;
  /** what the applet can do about it: signin, premium (the account cannot
   *  play), nodevice (nothing to play on), rate (Spotify asked to wait),
   *  restricted (the device refuses), other */
  reason: "signin" | "premium" | "nodevice" | "rate" | "restricted" | "other";
}
