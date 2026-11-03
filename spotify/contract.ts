// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/contract.ts — what the `spotify` service answers. omarchy-pocketd
// implements it on Omarchy Pocket (daemon/spotify.ts in
// pocket-nexus/omarchy-pocket, which imports this file through its
// vendor/applets submodule); the applet's sample data (spotify/mock/) answers
// it in the store's player. Every path is under companionService("spotify").
//
// The service holds the Spotify sign-in (an OAuth PKCE grant of the owner's
// own Client ID; the refresh token never reaches the applet), turns the Web
// API's objects into the compact ones below, and runs librespot as this
// device's Spotify Connect speaker. A request answers JSON; a failure answers
// a 4xx or 5xx with `Failure`.
//
//   GET  /status                       Status
//   POST /config     {clientId}        Status     set or clear the Client ID
//   POST /signin                       Status     start a sign-in: status.signIn has the URL for a QR code
//   POST /cancel                       Status     forget the sign-in waiting for the phone
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
  /** a Client ID is set */
  configured: boolean;
  signedIn: boolean;
  user: { id: string; name: string; image: string } | null;
  /** a sign-in waiting for the owner's phone: show `url` as a QR code */
  signIn: { url: string; expiresAt: number } | null;
  /** why the last sign-in or the session failed, for the reader */
  error: string;
  /** librespot, this device's Spotify Connect speaker */
  speaker: {
    name: string;
    /** off: not running; starting; waiting: running, and Spotify has not
     *  signed it in yet (pick it once in Spotify on a phone);
     *  ready: in the account's devices; error: see message */
    state: "off" | "starting" | "waiting" | "ready" | "error";
    /** its Connect device id once Spotify lists it */
    id: string | null;
    message: string;
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
  /** null when Spotify does not list this playlist's tracks to the app (a
   *  playlist the owner neither made nor collaborates on): it still plays */
  tracks: Page | null;
}

export interface ArtistPage {
  artist: Item;
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
  /** this device's own speaker (librespot) */
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
  /** where to play; absent: the active device, or this device's speaker */
  deviceId?: string;
}

export interface Failure {
  error: string;
  /** what the applet can do about it: configure (no Client ID), signin,
   *  premium (the account cannot play), nodevice (nothing to play on),
   *  rate (Spotify asked to wait), restricted (the device refuses), other */
  reason: "configure" | "signin" | "premium" | "nodevice" | "rate" | "restricted" | "other";
}
