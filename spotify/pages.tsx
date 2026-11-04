// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/pages.tsx — the list pages: Library (Playlists, Albums, Artists,
// Songs), Search (a field and Songs, Albums, Artists, Playlists), an album,
// a playlist, Liked Songs, an artist, the queue, the devices and the
// account. A page is a head (spotify/list.tsx Block), rows a page at a time
// (the service's `next` token, asked for as the reader nears the end), and
// a foot for loading, empty and failed.
//
// Tapping a track plays its album or playlist from that track; Shuffle plays
// it from a random place with shuffle on. An item opened from another page
// shows its cover and title at once, while its page is on its way.

import { createEffect, createMemo, For, Show, type Accessor } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { viewHeight, type LayerContext, type PageSpec } from "../ui/nav.tsx";
import { SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { FONT, measure, wrap } from "../ui/text.ts";
import { coverSide, type SearchType, type Shelf } from "./api.ts";
import type { Device, Item } from "./contract.ts";
import { facts, songs, span } from "./format.ts";
import { ICON } from "./icons.ts";
import { itemRows, listContent, sectionRow, type Block, type Lead, type Row } from "./list.tsx";
import type { Paged, Problem } from "./model.ts";
import { Chip, CHIP_H, Cover, IconButton, Lines, litFor, Message, messageButtonY, messageHeight, Pill, PlayButton, type Control, type Env } from "./parts.tsx";
import { barTitle, fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

/** Items opened from another page, by page id: shown while their page loads. */
const opened = new Map<string, Item>();

export function remember(page: string, item: Item): void {
  opened.set(page, item);
  if (opened.size > 64) opened.delete(opened.keys().next().value as string);
}

export const pageOf = (kind: string, id: string) => `${kind}:${encodeURIComponent(id)}`;
export const partsOf = (page: string): [string, string] => {
  const at = page.indexOf(":");
  return at < 0 ? [page, ""] : [page.slice(0, at), decodeURIComponent(page.slice(at + 1))];
};

/** What every list page's spec has: the bar, and room for the mini player along the bottom. */
function spec(env: Env, title: Accessor<string>, backLabel: string, rest: Partial<PageSpec>): PageSpec {
  return { title, backLabel, tint: "flat", barColors: BAR, inset: env.inset, ...rest };
}

// ---- feet: loading, empty, failed, more ----------------------------------------

/** The foot of a paged list: its first load, its failure with a retry, its
 *  empty state, and a spinner while a later page is on its way. */
function pagedFoot(env: Env, layer: LayerContext, list: Accessor<Paged | null>, W: number, empty: Accessor<{ title: string; detail?: string } | null>) {
  const lit = litFor(env, layer.focus);
  return (top: Accessor<number>): Block => {
    const state = () => {
      const paged = list();
      if (!paged) return empty() ? "empty" : "none";
      if (paged.problem() && paged.items().length === 0) return "failed";
      if (paged.loading() && paged.items().length === 0) return "loading";
      if (paged.items().length === 0) return empty() ? "empty" : "none";
      if (paged.loadingMore()) return "more";
      return "none";
    };
    const problem = () => list()?.problem() ?? null;
    return {
      height: () => {
        switch (state()) {
          case "failed":
            return 24 + messageHeight(problem()!.detail, W, true);
          case "loading":
            return 120;
          case "empty":
            return 24 + messageHeight(empty()!.detail, W, false);
          case "more":
            return 56;
          default:
            return 0;
        }
      },
      controls: () => (state() === "failed" ? [{ id: "foot.retry", x: (W - 150) / 2, y: top() + messageButtonY(24, problem()!.detail, W), w: 150, h: 32, run: () => list()?.reload() }] : []),
      view: () => (
        <>
          <Show when={state() === "failed"}>
            <Message w={W} top={top() + 24} title={problem()!.title} detail={problem()!.detail} button={{ id: "foot.retry", label: "Try Again" }} lit={lit} />
          </Show>
          <Show when={state() === "loading" || state() === "more"}>
            <Message w={W} top={top() + 16} title="" spinner />
          </Show>
          <Show when={state() === "empty"}>
            <Message w={W} top={top() + 24} title={empty()!.title} detail={empty()!.detail} />
          </Show>
        </>
      ),
    };
  };
}

/** A row of chips from content y `y`; their controls. */
function chips<T extends string>(env: Env, layer: LayerContext, choices: readonly (readonly [T, string])[], current: Accessor<T>, choose: (value: T) => void, y: number, prefix: string) {
  const lit = litFor(env, layer.focus);
  let x = S.pad;
  const placed = choices.map(([value, label]) => {
    const w = Math.ceil(measure(label, FONT.xs)) + 24;
    const at = { value, label, x, w, id: `${prefix}.${value}` };
    x += w + 6;
    return at;
  });
  return {
    view: () => <For each={placed}>{(chip) => <Chip x={chip.x} y={y} w={chip.w} label={chip.label} on={() => current() === chip.value} lit={() => lit(chip.id)} />}</For>,
    controls: placed.map((chip): Control => ({ id: chip.id, x: chip.x, y: y - 3, w: chip.w, h: CHIP_H + 6, run: () => choose(chip.value) })),
  };
}

// ---- Library ----------------------------------------------------------------------

const SHELVES = [["playlists", "Playlists"], ["albums", "Albums"], ["artists", "Artists"], ["tracks", "Songs"]] as const;

/** The subtitle a row of `kind` shows. */
const kindLine = (item: Item): string =>
  item.kind === "album" ? facts(["Album", item.subtitle]) : item.kind === "playlist" ? facts(["Playlist", item.subtitle]) : item.kind === "artist" ? "Artist" : item.kind === "liked" ? facts(["Playlist", item.count !== undefined ? songs(item.count) : ""]) : item.subtitle;

const leadOf = (kind: string): Lead => (kind === "artists" || kind === "artist" ? "round" : "cover");

export function libraryPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model, client } = env;
  const list = createMemo(() => {
    const shelf = model.shelf();
    return model.answers.paged(`library.${shelf}`, (next) => client.library(shelf, next));
  });
  const row = chips<Shelf>(env, layer, SHELVES, model.shelf, (shelf) => model.setShelf(shelf), 4, "shelf");
  const likedUri = () => model.answers.query("home", () => client.home()).data()?.playlists.find((item) => item.kind === "liked")?.uri ?? "";
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: { height: () => CHIP_H + 10, view: row.view, controls: () => row.controls },
    rows: (top) => {
      const shelf = model.shelf();
      return itemRows(env, list().items(), top, W, {
        lead: leadOf(shelf),
        prefix: `lib.${shelf}`,
        subtitle: kindLine,
        run: (item) => (item.kind === "track" ? env.open(item, likedUri() || undefined) : env.open(item)),
      });
    },
    foot: pagedFoot(env, layer, list, W, () => ({ title: "Nothing saved yet", detail: "What you save in Spotify shows here." })),
    onEnd: () => list().more(),
  });
  return spec(env, () => "Library", "Library", {
    content,
    legend: () => [{ button: "triangle", label: "Reload" }],
    key(pressed) {
      if (!(pressed & BTN.TRIANGLE)) return false;
      list().reload();
      return true;
    },
  });
}

// ---- Search -----------------------------------------------------------------------

const KINDS = [["track", "Songs"], ["album", "Albums"], ["artist", "Artists"], ["playlist", "Playlists"]] as const;

/** The search field's height. */
const FIELD_H = 30;

/** The search field: white, with what is typed, the words searched or a placeholder. */
function SearchField(props: { env: Env; x: number; y: number; w: number; lit: Accessor<boolean> }) {
  const text = () => {
    const draft = props.env.draft("search");
    const words = props.env.model.words();
    props.env.faces.revision();
    if (draft !== null) return fit(props.env.faces, draft || "|", F.body, props.w - 44);
    return fit(props.env.faces, words || "What do you want to listen to?", F.body, props.w - 44);
  };
  const typed = () => props.env.draft("search") !== null || props.env.model.words() !== "";
  return (
    <>
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.w, height: FIELD_H, radius: 6, bgColor: props.lit() ? "#e6e6e6" : C.white }} />
      <Image class="absolute w-[16] h-[16]" src={ICON.search.black16} style={{ insetL: props.x + 10, insetT: props.y + (FIELD_H - 16) / 2 }} />
      <Lines fitted={text()} x={props.x + 34} y={props.y + (FIELD_H - 17) / 2} w={props.w - 44} leading={17} color={typed() ? C.black : "#6a6a6a"} />
    </>
  );
}

export function searchPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model, client } = env;
  const lit = litFor(env, layer.focus);
  const list = createMemo(() => {
    const words = model.words().trim();
    const kind = model.kind();
    return words ? model.answers.paged(`search.${kind}.${words}`, (next) => client.search(words, kind, next)) : null;
  });
  const row = chips<SearchType>(env, layer, KINDS, model.kind, (kind) => model.setKind(kind), 4 + FIELD_H + 6, "kind");
  const field: Control = { id: "search.field", x: S.pad, y: 4, w: W - S.pad * 2, h: FIELD_H, run: () => env.edit("search") };
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: {
      height: () => 4 + FIELD_H + 6 + CHIP_H + 6,
      controls: () => [field, ...row.controls],
      view: () => (
        <>
          <SearchField env={env} x={field.x} y={field.y} w={field.w} lit={() => lit(field.id)} />
          {row.view()}
        </>
      ),
    },
    rows: (top) => {
      const kind = model.kind();
      return itemRows(env, list()?.items() ?? [], top, W, { lead: leadOf(kind), prefix: `found.${kind}`, subtitle: kindLine, run: (item) => env.open(item) });
    },
    foot: pagedFoot(env, layer, list, W, () =>
      model.words().trim()
        ? { title: "Nothing found", detail: `Spotify found no ${KINDS.find(([kind]) => kind === model.kind())![1].toLowerCase()} for these words.` }
        : { title: "Search Spotify", detail: "Find songs, albums, artists and playlists. Tap the field and type." }),
    onEnd: () => list()?.more(),
  });
  return spec(env, () => "Search", "Search", {
    content,
    legend: () => [{ button: "square", label: "Type" }],
    key(pressed) {
      if (!(pressed & BTN.SQUARE)) return false;
      env.edit("search");
      return true;
    },
  });
}

// ---- an album, a playlist, Liked Songs, an artist ------------------------------

interface Head {
  title: string;
  image: string;
  round?: boolean;
  liked?: boolean;
  /** Lines under the title: the artists (a link), a description, the facts. */
  lines: { text: string; color: string; bold?: boolean; max?: number; link?: () => void }[];
  play?: { run: () => void; playing: Accessor<boolean> };
  shuffle?: () => void;
  like?: { on: Accessor<boolean>; run: () => void };
}

/** The head of a detail page: the cover, what it is, its title, its lines,
 *  and Play, Shuffle and Like under them. */
function detailHead(env: Env, layer: LayerContext, read: Accessor<Head>, W: number): Block {
  const lit = litFor(env, layer.focus);
  const head = createMemo(read);
  // The head is a band: the cover at the left, the title, its lines and the
  // buttons beside it. A narrow tile has a smaller cover, one line under the
  // title (the artists, the owner) and smaller buttons.
  const band = W >= 400;
  const SIZE = band ? 96 : 56;
  const TOP = 8;
  const PLAY = band ? 36 : 32;
  const BUTTON = band ? 32 : 28;
  const LEADING = 15;
  const textX = S.pad + SIZE + 12;
  const textW = W - textX - S.pad;
  const side = coverSide(SIZE);
  const layout = createMemo(() => {
    env.faces.revision();
    const value = head();
    // two title lines on a tall band; the bar shows the title whole
    const title = fit(env.faces, value.title, band ? F.h1 : F.h3, textW, band && SCREEN_H >= 300 ? 2 : 1);
    // a title from the glyph atlas is the atlas face's size, not the h1's
    const leading = title.slot >= F.rich ? 18 : band ? 23 : 19;
    let y = TOP + title.lines.length * leading + 2;
    const lines = value.lines.filter((line) => line.text).slice(0, band ? undefined : 1).map((line, index) => {
      const fitted = fit(env.faces, line.text, line.bold ? F.smallBold : F.small, textW, band ? line.max ?? 1 : 1);
      const at = { ...line, fitted, y, id: `head.line.${index}` };
      y += fitted.lines.length * LEADING + 1;
      return at;
    });
    const actionsX = textX;
    const actionsY = Math.max(TOP + SIZE - PLAY, y + (band ? 4 : 2));
    const height = Math.max(TOP + SIZE, actionsY + PLAY) + (band ? 8 : 6);
    return { title, leading, lines, actionsX, actionsY, height };
  });
  const actions = createMemo(() => {
    const value = head();
    const y = layout().actionsY;
    const out: (Control & { kind: "play" | "shuffle" | "like" })[] = [];
    let x = layout().actionsX;
    if (value.play) out.push({ kind: "play", id: "head.play", x, y, w: PLAY, h: PLAY, run: value.play.run }), (x += PLAY + 10);
    if (value.shuffle) out.push({ kind: "shuffle", id: "head.shuffle", x, y: y + (PLAY - BUTTON) / 2, w: BUTTON, h: BUTTON, run: value.shuffle }), (x += BUTTON + 6);
    if (value.like) out.push({ kind: "like", id: "head.like", x, y: y + (PLAY - BUTTON) / 2, w: BUTTON, h: BUTTON, run: value.like.run });
    return out;
  });
  const links = () => layout().lines.filter((line) => line.link).map((line): Control => ({ id: line.id, x: textX, y: line.y - 2, w: textW, h: line.fitted.lines.length * LEADING + 4, run: line.link! }));
  return {
    height: () => layout().height,
    controls: () => [...links(), ...actions()],
    view: () => (
      <>
        <Cover covers={env.covers} url={() => head().image} x={S.pad} y={TOP} size={SIZE} side={side} round={head().round} liked={head().liked} />
        <Lines fitted={layout().title} x={textX} y={TOP} w={textW} leading={layout().leading} color={C.text} />
        <For each={layout().lines}>
          {(line) => (
            <>
              <Show when={line.link && lit(line.id)}>
                <View class="absolute" style={{ insetL: textX - 4, insetT: line.y - 2, width: textW + 8, height: line.fitted.lines.length * LEADING + 4, radius: 4, bgColor: C.lit }} />
              </Show>
              <Lines fitted={line.fitted} x={textX} y={line.y} w={textW} leading={LEADING} color={line.color} />
            </>
          )}
        </For>
        <For each={actions()}>
          {(action) =>
            action.kind === "play" ? (
              <PlayButton x={action.x} y={action.y} size={PLAY} playing={head().play!.playing} lit={() => lit(action.id)} />
            ) : action.kind === "shuffle" ? (
              <IconButton x={action.x} y={action.y} w={BUTTON} h={BUTTON} size={20} icon={() => ICON.shuffle.muted20} lit={() => lit(action.id)} />
            ) : (
              <IconButton x={action.x} y={action.y} w={BUTTON} h={BUTTON} size={20} icon={() => (head().like!.on() ? ICON["heart-fill"].green20 : ICON.heart.white20)} lit={() => lit(action.id)} />
            )}
        </For>
      </>
    ),
  };
}

/** The player has this context and is playing it. */
const playingContext = (env: Env, uri: string) => () => {
  const player = env.model.player();
  return !!player?.playing && !!uri && player.context?.uri === uri;
};

/** Play, or pause what plays from this context. */
const playOrPause = (env: Env, uri: () => string) => () => {
  const player = env.model.player();
  if (player?.context?.uri === uri() && player.active) env.model.toggle();
  else if (uri()) env.model.play(uri());
};

export function albumPage(env: Env, layer: LayerContext, page: string): PageSpec {
  const W = SCREEN_W;
  const [, id] = partsOf(page);
  const { model, client } = env;
  const album = model.answers.query(`album.${id}`, () => client.album(id));
  const tracks = model.answers.continued(`album.${id}.tracks`, () => album.data()?.tracks ?? null, (next) => client.tracks("album", id, next));
  const known = opened.get(page);
  const item = () => album.data()?.album ?? known ?? null;
  const uri = () => item()?.uri ?? "";
  const length = () => (tracks.hasMore() ? 0 : tracks.items().reduce((sum, track) => sum + (track.durationMs ?? 0), 0));
  // what the album's answer says about Like, unless a tap since said otherwise
  createEffect(() => {
    const data = album.data();
    if (data && model.liked(data.album.uri) === null) model.knowLiked(data.album.uri, data.liked);
  });
  const head = () => {
    const value = item();
    const artists = value?.artists ?? [];
    return {
      title: value?.title ?? "",
      image: value?.image ?? "",
      lines: [
        { text: artists.map((artist) => artist.name).join(", ") || value?.subtitle || "", color: C.text, bold: true, link: artists[0] ? () => openArtist(env, artists[0]!.id, artists[0]!.name) : undefined },
        { text: facts(["Album", value?.year, value?.count !== undefined ? songs(value.count) : "", span(length())]), color: C.muted },
      ],
      play: { run: playOrPause(env, uri), playing: playingContext(env, uri()) },
      shuffle: () => uri() && model.play(uri(), undefined, { count: value?.count ?? tracks.items().length }),
      like: { on: () => model.liked(uri()) === true, run: () => uri() && model.toggleLike(uri()) },
    } satisfies Head;
  };
  const block = detailHead(env, layer, head, W);
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: block,
    rows: (top) => itemRows(env, tracks.items(), top, W, { lead: "number", numbered: true, prefix: "track", run: (track) => uri() && model.play(uri(), { uri: track.uri }) }),
    foot: pagedFoot(env, layer, () => detailList(album, tracks), W, () => null),
    onEnd: tracks.more,
  });
  return spec(env, () => barTitle(item()?.title ?? "", "Album"), "Album", { content, legend: detailLegend, key: detailKeys(env, head) });
}

/** A detail page's list: its query's failure first, then its tracks'. */
function detailList(query: { problem: Accessor<Problem | null>; data: Accessor<unknown>; reload(): void }, list: Paged): Paged {
  return {
    ...list,
    problem: () => (query.data() === null ? query.problem() : list.problem()),
    loading: () => query.data() === null && !query.problem(),
    reload: () => (query.data() === null ? query.reload() : list.reload()),
  };
}

const detailLegend = () => [
  { button: "triangle" as const, label: "Play" },
  { button: "square" as const, label: "Shuffle" },
];

function detailKeys(env: Env, head: Accessor<Head>) {
  return (pressed: number) => {
    if (pressed & BTN.TRIANGLE) head().play?.run();
    else if (pressed & BTN.SQUARE) head().shuffle?.();
    else if (pressed & BTN.START) env.stack.push("player");
    else return false;
    return true;
  };
}

function openArtist(env: Env, id: string, name: string): void {
  const page = pageOf("artist", id);
  remember(page, { kind: "artist", id, uri: `spotify:artist:${id}`, title: name, subtitle: "Artist", image: "" });
  env.stack.push(page);
}

export function playlistPage(env: Env, layer: LayerContext, page: string): PageSpec {
  const W = SCREEN_W;
  const [, id] = partsOf(page);
  const { model, client } = env;
  const playlist = model.answers.query(`playlist.${id}`, () => client.playlist(id));
  const tracks = model.answers.continued(`playlist.${id}.tracks`, () => playlist.data()?.tracks ?? null, (next) => client.tracks("playlist", id, next));
  const known = opened.get(page);
  const item = () => playlist.data()?.playlist ?? known ?? null;
  const uri = () => item()?.uri ?? "";
  /** Spotify does not list this playlist's tracks to the app. */
  const unlisted = () => playlist.data() !== null && playlist.data()!.tracks === null;
  const head = () => {
    const value = playlist.data()?.playlist;
    const count = value?.count ?? known?.count;
    return {
      title: item()?.title ?? "",
      image: item()?.image ?? "",
      lines: [
        { text: value?.owner ?? known?.subtitle ?? "", color: C.text, bold: true },
        { text: value?.description ?? "", color: C.muted, max: 2 },
        { text: facts(["Playlist", count !== undefined ? songs(count) : ""]), color: C.muted },
      ],
      play: { run: playOrPause(env, uri), playing: playingContext(env, uri()) },
      shuffle: () => uri() && model.play(uri(), undefined, { count: count ?? tracks.items().length }),
    } satisfies Head;
  };
  const block = detailHead(env, layer, head, W);
  const note = "Spotify does not list this playlist's songs here. Play and Shuffle play all of it.";
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: block,
    rows: (top) => (unlisted() ? [] : itemRows(env, tracks.items(), top, W, { lead: "cover", prefix: "track", run: (track) => uri() && model.play(uri(), { uri: track.uri }) })),
    foot: (top) => {
      const paged = pagedFoot(env, layer, () => (unlisted() ? null : detailList(playlist, tracks)), W, () => (playlist.data() && !unlisted() ? { title: "No songs", detail: "This playlist is empty." } : null))(top);
      const lines = () => wrap(note, FONT.xs, W - S.pad * 2, 4);
      return {
        height: () => (unlisted() ? 16 + lines().length * 17 + 16 : paged.height()),
        controls: () => (unlisted() ? [] : paged.controls()),
        view: () => (
          <>
            <Show when={unlisted()}>
              <View class="absolute" style={{ insetL: S.pad, insetT: top() + 4, width: W - S.pad * 2, height: lines().length * 17 + 16, radius: 6, bgColor: C.surface }} />
              <For each={lines()}>{(line, index) => <Text class="absolute text-xs" style={{ insetL: S.pad + 10, insetT: top() + 12 + index() * 17, width: W - S.pad * 2 - 20, textColor: C.muted }}>{line}</Text>}</For>
            </Show>
            <Show when={!unlisted()}>{paged.view()}</Show>
          </>
        ),
      };
    },
    onEnd: tracks.more,
  });
  return spec(env, () => barTitle(item()?.title ?? "", "Playlist"), "Playlist", { content, legend: detailLegend, key: detailKeys(env, head) });
}

export function likedPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model, client } = env;
  const list = model.answers.paged("library.tracks", (next) => client.library("tracks", next));
  const known = opened.get("liked");
  const userId = () => model.status()?.user?.id ?? "";
  const uri = () => known?.uri || (userId() ? `spotify:user:${userId()}:collection` : "");
  const head = (): Head => {
    const count = list.total() ?? known?.count;
    return {
      title: "Liked Songs",
      image: "",
      liked: true,
      lines: [
        { text: model.status()?.user?.name ?? "", color: C.text, bold: true },
        { text: facts(["Playlist", count !== undefined && count !== null ? songs(count) : ""]), color: C.muted },
      ],
      play: { run: playOrPause(env, uri), playing: playingContext(env, uri()) },
      shuffle: () => uri() && model.play(uri(), undefined, { count: count ?? list.items().length }),
    };
  };
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: detailHead(env, layer, head, W),
    rows: (top) => itemRows(env, list.items(), top, W, { lead: "cover", prefix: "liked", run: (track) => uri() && model.play(uri(), { uri: track.uri }) }),
    foot: pagedFoot(env, layer, () => list, W, () => ({ title: "No liked songs", detail: "Tap the heart on a song to keep it here." })),
    onEnd: list.more,
  });
  return spec(env, () => "Liked Songs", "Liked Songs", { content, legend: detailLegend, key: detailKeys(env, head) });
}

export function artistPage(env: Env, layer: LayerContext, page: string): PageSpec {
  const W = SCREEN_W;
  const [, id] = partsOf(page);
  const { model, client } = env;
  const artist = model.answers.query(`artist.${id}`, () => client.artist(id));
  const albums = model.answers.continued(`artist.${id}.albums`, () => artist.data()?.albums ?? null, (next) => client.artistAlbums(id, next));
  const known = opened.get(page);
  const item = () => artist.data()?.artist ?? known ?? null;
  const uri = () => item()?.uri ?? "";
  const head = (): Head => ({
    title: item()?.title ?? "",
    image: item()?.image ?? "",
    round: true,
    lines: [{ text: facts(["Artist", albums.total() ? `${albums.total()} albums and singles` : ""]), color: C.muted }],
    play: { run: playOrPause(env, uri), playing: playingContext(env, uri()) },
    shuffle: () => uri() && model.play(uri(), undefined, { count: 0 }),
  });
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: detailHead(env, layer, head, W),
    // Popular: the artist's own tracks, which play the artist from that one; then Albums
    rows: (top) => {
      const out: Row[] = [];
      let y = top;
      const add = (rows: Row[]) => {
        out.push(...rows);
        if (rows.length) y = rows[rows.length - 1]!.y + rows[rows.length - 1]!.h;
      };
      const popular = artist.data()?.top ?? [];
      if (popular.length) {
        add([sectionRow(env, "top.head", "Popular", y, W)]);
        add(itemRows(env, popular, y, W, { lead: "cover", prefix: "top", subtitle: (track) => track.album?.name || track.subtitle, run: (track) => uri() && model.play(uri(), { uri: track.uri }) }));
      }
      const list = albums.items();
      if (list.length) {
        add([sectionRow(env, "albums.head", "Albums", y, W)]);
        add(itemRows(env, list, y, W, { lead: "cover", prefix: "album", subtitle: (album) => facts([album.year, album.count !== undefined ? songs(album.count) : ""]), run: (album) => env.open(album) }));
      }
      return out;
    },
    foot: pagedFoot(env, layer, () => detailList(artist, albums), W, () => (artist.data() ? { title: "No albums", detail: "Spotify lists no albums for this artist." } : null)),
    onEnd: albums.more,
  });
  return spec(env, () => barTitle(item()?.title ?? "", "Artist"), "Artist", { content, legend: detailLegend, key: detailKeys(env, head) });
}

// ---- the queue --------------------------------------------------------------------

export function queuePage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model, client } = env;
  const queue = model.answers.query("queue", () => client.queue());
  if (queue.data()) queue.reload();
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    rows: (top) => {
      const value = queue.data();
      if (!value) return [];
      const out: Row[] = [];
      let y = top;
      const add = (rows: Row[]) => {
        out.push(...rows);
        y = rows.length ? rows[rows.length - 1]!.y + rows[rows.length - 1]!.h : y;
      };
      if (value.now) {
        add([sectionRow(env, "now.head", "Now playing", y, W)]);
        add(itemRows(env, [value.now], y, W, { lead: "cover", prefix: "now" }));
      }
      if (value.next.length) {
        add([sectionRow(env, "next.head", "Next up", y, W)]);
        add(itemRows(env, value.next, y, W, { lead: "cover", prefix: "next" }));
      }
      return out;
    },
    foot: (top) => {
      const lit = litFor(env, layer.focus);
      const problem = () => (queue.data() === null ? queue.problem() : null);
      const empty = () => queue.data() !== null && !queue.data()!.now && queue.data()!.next.length === 0;
      return {
        height: () => (problem() ? 24 + messageHeight(problem()!.detail, W, true) : empty() || !queue.data() ? 140 : 0),
        controls: () => (problem() ? [{ id: "queue.retry", x: (W - 150) / 2, y: top() + messageButtonY(24, problem()!.detail, W), w: 150, h: 32, run: queue.reload }] : []),
        view: () => (
          <>
            <Show when={problem()}>{(failed) => <Message w={W} top={top() + 24} title={failed().title} detail={failed().detail} button={{ id: "queue.retry", label: "Try Again" }} lit={lit} />}</Show>
            <Show when={empty()}>
              <Message w={W} top={top() + 24} title="The queue is empty" detail="Play an album or a playlist: what comes next shows here." />
            </Show>
            <Show when={!queue.data() && !problem()}>
              <Message w={W} top={top() + 24} title="" spinner />
            </Show>
          </>
        ),
      };
    },
  });
  return spec(env, () => "Queue", "Queue", { content, activateLabel: () => "", right: () => ({ id: "queue.reload", label: "Reload", kind: "plain", run: queue.reload }) });
}

// ---- devices ----------------------------------------------------------------------

const DEVICE_H = 42;

function deviceIcon(device: Device, on: boolean): string {
  const type = device.type.toLowerCase();
  if (type === "gameconsole") return on ? ICON.console.green20 : ICON.console.white20;
  if (type === "smartphone" || type === "tablet") return on ? ICON.phone.green20 : ICON.phone.white20;
  if (type === "computer") return on ? ICON.computer.green20 : ICON.computer.white20;
  return on ? ICON.speaker.green20 : ICON.speaker.white20;
}

function deviceDetail(device: Device): string {
  return facts([
    device.local ? "This device" : device.type === "GameConsole" ? "Console" : device.type,
    device.active ? "Playing" : "",
    device.restricted ? "Does not take commands" : device.volume !== null ? `Volume ${device.volume}%` : "",
  ]);
}

export function devicesPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model } = env;
  const devices = model.devices();
  if (devices.data()) devices.reload();
  const lit = litFor(env, layer.focus);
  const hint = () => (devices.data()?.some((device) => device.local) ? "" : model.speakerNote());
  const hintLines = () => (hint() ? wrap(hint(), FONT.xs, W - S.pad * 2 - 20, 3) : []);
  const top = () => (hintLines().length ? hintLines().length * 16 + 28 : 4);
  const list = () => devices.data() ?? [];
  const controls = (): Control[] => [
    ...list().map((device, index) => ({ id: `device.${device.id}`, x: 0, y: top() + index * DEVICE_H, w: W, h: DEVICE_H, run: () => model.transfer(device) })),
    ...(devices.problem() && !devices.data() ? [{ id: "devices.retry", x: (W - 150) / 2, y: top() + messageButtonY(24, devices.problem()!.detail, W), w: 150, h: 32, run: devices.reload }] : []),
  ];
  const names = createMemo(() => {
    env.faces.revision();
    return list().map((device) => fit(env.faces, device.name, F.bodyBold, W - 44 - S.pad - 30));
  });
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: {
      height: () => top() + Math.max(list().length * DEVICE_H, devices.data() ? (list().length ? 0 : 120) : 140),
      controls,
      view: () => (
        <>
          <Show when={hintLines().length}>
            <View class="absolute" style={{ insetL: S.pad, insetT: 8, width: W - S.pad * 2, height: hintLines().length * 16 + 14, radius: 6, bgColor: C.surface }} />
            <For each={hintLines()}>{(line, index) => <Text class="absolute text-xs" style={{ insetL: S.pad + 10, insetT: 15 + index() * 16, width: W - S.pad * 2 - 20, textColor: C.text }}>{line}</Text>}</For>
          </Show>
          <For each={list()}>
            {(device, index) => {
              const y = () => top() + index() * DEVICE_H;
              return (
                <>
                  <Show when={lit(`device.${device.id}`)}>
                    <View class="absolute left-0" style={{ insetT: y(), width: W, height: DEVICE_H, bgColor: C.lit }} />
                  </Show>
                  <Image class="absolute w-[20] h-[20]" src={deviceIcon(device, device.active)} style={{ insetL: S.pad + 2, insetT: y() + 11 }} />
                  <Lines fitted={names()[index()] ?? { lines: [device.name], slot: F.bodyBold }} x={44} y={y() + 5} w={W - 44 - S.pad - 30} leading={16} color={device.active ? C.accent : device.restricted ? C.faint : C.text} />
                  <Text class="absolute text-xs" style={{ insetL: 44, insetT: y() + 22, width: W - 44 - S.pad, textColor: C.muted }}>{deviceDetail(device)}</Text>
                  <Show when={device.active}>
                    <Image class="absolute w-[16] h-[16]" src={ICON.check.green16} style={{ insetL: W - S.pad - 16, insetT: y() + 13 }} />
                  </Show>
                </>
              );
            }}
          </For>
          <Show when={devices.data() && list().length === 0}>
            <Message w={W} top={top() + 24} title="No devices" detail="Open Spotify on a phone or a computer: it shows here." />
          </Show>
          <Show when={!devices.data() && devices.problem()}>{(failed) => <Message w={W} top={top() + 24} title={failed().title} detail={failed().detail} button={{ id: "devices.retry", label: "Try Again" }} lit={lit} />}</Show>
          <Show when={!devices.data() && !devices.problem()}>
            <Message w={W} top={top() + 24} title="" spinner />
          </Show>
        </>
      ),
    },
    rows: () => [],
  });
  return spec(env, () => "Devices", "Devices", { content, activateLabel: () => "Play Here", right: () => ({ id: "devices.reload", label: "Reload", kind: "plain", run: devices.reload }) });
}

// ---- the account ------------------------------------------------------------------

const SPEAKER_STATES = { off: "Off", starting: "Starting", ready: "Ready", refused: "Refused by Spotify", pair: "Waiting to be picked", conflict: "Taken by another account", error: "Stopped" } as const;
/** The speaker's engine, as the Account says it. */
const ENGINES = { librespot: "librespot", soloist: "Spotify's own player" } as const;

export function accountPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const { model } = env;
  const lit = litFor(env, layer.focus);
  const status = model.status;
  const name = createMemo(() => {
    env.faces.revision();
    return fit(env.faces, status()?.user?.name ?? "Spotify", F.h2, W - 92 - S.pad);
  });
  /** A fact's height: its line, and its note with a gap under it. */
  const factH = (fact: { note: string[] }) => 24 + (fact.note.length ? fact.note.length * 16 + 6 : 0);
  /** The facts, a label and a value each, with a note under a value that needs one. */
  const details = createMemo(() => {
    const value = status();
    if (!value) return [];
    const out: { label: string; value: string; note: string[] }[] = [];
    const noteW = W - S.pad * 2 - 20;
    if (value.premium !== null) {
      out.push({ label: "Premium", value: value.premium ? "Yes" : "No", note: value.premium ? [] : wrap("Playing needs Spotify Premium. Browsing works without it.", FONT.xs, noteW, 3) });
    }
    const speaker = value.speaker;
    const note = speaker.state === "refused" || speaker.state === "pair" || speaker.state === "conflict" ? model.speakerNote() : speaker.state === "error" ? speaker.message : "";
    out.push({ label: "Speaker", value: `${speaker.name || "This device"}: ${SPEAKER_STATES[speaker.state] ?? speaker.state}`, note: note ? wrap(note, FONT.xs, noteW, 3) : [] });
    out.push({ label: "Plays through", value: ENGINES[speaker.engine] ?? speaker.engine, note: [] });
    let y = 0;
    return out.map((fact) => {
      const at = { ...fact, y };
      y += factH(fact);
      return at;
    });
  });
  const factsTop = 92;
  const factsH = () => details().reduce((sum, fact) => sum + factH(fact), 0) + 8;
  const errorLines = () => (status()?.error ? wrap(status()!.error, FONT.xs, W - S.pad * 2, 3) : []);
  const errorTop = () => factsTop + factsH() + 12;
  const buttonsTop = () => errorTop() + (errorLines().length ? errorLines().length * 16 + 12 : 0);
  const buttonW = Math.min(220, W - S.pad * 2);
  const controls = (): Control[] => [
    { id: "account.player", x: (W - buttonW) / 2, y: buttonsTop(), w: buttonW, h: 36, run: () => model.openSetup() },
    {
      id: "account.signout",
      x: (W - buttonW) / 2,
      y: buttonsTop() + 46,
      w: buttonW,
      h: 36,
      run: () => env.confirm({ title: "Sign out of Spotify?", message: "This device forgets your sign-in, and its speaker leaves your devices until you sign in again.", action: "Sign Out", run: () => model.signOut() }),
    },
  ];
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(env.inset),
    head: {
      height: () => buttonsTop() + 46 + 48,
      controls,
      view: () => (
        <>
          <Cover covers={env.covers} url={() => status()?.user?.image ?? ""} x={S.pad} y={14} size={64} side={coverSide(64)} round />
          <Lines fitted={name()} x={92} y={24} w={W - 92 - S.pad} leading={22} color={C.text} />
          <Text class="absolute text-xs" style={{ insetL: 92, insetT: 50, width: W - 92 - S.pad, textColor: C.muted }}>Signed in to Spotify</Text>
          <View class="absolute" style={{ insetL: S.pad, insetT: factsTop, width: W - S.pad * 2, height: factsH(), radius: 6, bgColor: C.surface }} />
          <For each={details()}>
            {(fact) => (
              <>
                <Text class="absolute text-xs" style={{ insetL: S.pad + 10, insetT: factsTop + 8 + fact.y, width: 90, textColor: C.muted }}>{fact.label}</Text>
                <Text class="absolute text-xs font-bold text-right" style={{ insetL: S.pad + 100, insetT: factsTop + 8 + fact.y, width: W - S.pad * 2 - 110, textColor: C.text }}>{fact.value}</Text>
                <Show when={fact.note.length}>
                  <Text class="absolute text-xs leading-[16]" style={{ insetL: S.pad + 10, insetT: factsTop + 8 + fact.y + 20, width: W - S.pad * 2 - 20, textColor: C.muted }}>{fact.note.join("\n")}</Text>
                </Show>
              </>
            )}
          </For>
          <For each={errorLines()}>{(line, index) => <Text class="absolute text-xs" style={{ insetL: S.pad, insetT: errorTop() + index() * 16, width: W - S.pad * 2, textColor: C.red }}>{line}</Text>}</For>
          <Pill x={(W - buttonW) / 2} y={buttonsTop()} w={buttonW} h={36} label="Spotify's own player" primary={model.offerSetup()} lit={() => lit("account.player")} />
          <Pill x={(W - buttonW) / 2} y={buttonsTop() + 46} w={buttonW} h={36} label="Sign Out" lit={() => lit("account.signout")} />
        </>
      ),
    },
    rows: () => [],
  });
  return spec(env, () => "Account", "Account", { content, activateLabel: () => "Choose" });
}
