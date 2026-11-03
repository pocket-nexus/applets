// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/home.tsx — the three root pages' bar (the account's picture, then
// Home, Search and Library as small chips; L and R step through them) and
// Home: a "Jump back in" grid of compact cards (what was played lately,
// filled with the owner's playlists when that is short), then the
// playlists with Liked Songs first, saved albums and followed artists as
// shelves of small covers that pan sideways under a finger. The d-pad moves
// through the grid and the shelves as one grid of rows.

import { createMemo, For, Show } from "solid-js";
import { jump } from "@pocketjs/framework/animation";
import { Text, View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { createScroller, type Scroller } from "@pocketjs/framework/kinetics";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { NAV_H } from "../ui/bar.tsx";
import { viewHeight, type LayerContext, type PageSpec } from "../ui/nav.tsx";
import { appletSurfaceId, SCREEN_W } from "../ui/screen.ts";
import { FONT, measure } from "../ui/text.ts";
import { coverSide } from "./api.ts";
import { jumpBackIn } from "./format.ts";
import type { Item } from "./contract.ts";
import { listContent } from "./list.tsx";
import { Cover, Lines, litFor, Message, messageButtonY, messageHeight, type Control, type Env } from "./parts.tsx";
import { fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

export type Tab = "home" | "search" | "library";
export const TABS: readonly { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "library", label: "Library" },
];
const AVATAR = 22;
const TABS_X = 10 + AVATAR + 8;
const PILL_H = 24;
/** Each tab's left edge and width, measured once the faces are in. */
function tabPlaces(): { x: number; w: number }[] {
  let x = TABS_X;
  return TABS.map((tab) => {
    const w = Math.ceil(measure(tab.label, FONT.xsBold)) + 22;
    const at = { x, w };
    x += w + 5;
    return at;
  });
}

/** The bar of a root page: the account's picture and the three tabs. */
function TabBar(props: { env: Env; tab: Tab }) {
  const user = () => props.env.model.status()?.user ?? null;
  const places = tabPlaces();
  const top = (NAV_H - PILL_H) / 2;
  return (
    <>
      <Cover covers={props.env.covers} url={() => user()?.image ?? ""} x={10} y={(NAV_H - AVATAR) / 2} size={AVATAR} side={coverSide(AVATAR)} round />
      <Show when={props.env.press.is("tab.account")}>
        <View class="absolute" style={{ insetL: 10, insetT: (NAV_H - AVATAR) / 2, width: AVATAR, height: AVATAR, radius: AVATAR / 2, bgColor: "#ffffff40" }} />
      </Show>
      <For each={TABS}>
        {(tab, index) => (
          <>
            <View class="absolute" style={{ insetL: places[index()]!.x, insetT: top, width: places[index()]!.w, height: PILL_H, radius: PILL_H / 2, bgColor: props.tab === tab.id ? C.accent : props.env.press.is(`tab.${tab.id}`) ? "#3e3e3e" : C.raised }} />
            <Text class="absolute text-xs font-bold text-center" style={{ insetL: places[index()]!.x, insetT: top + (PILL_H - 15) / 2, width: places[index()]!.w, textColor: props.tab === tab.id ? C.black : C.text }}>{tab.label}</Text>
          </>
        )}
      </For>
    </>
  );
}

/** A root page: the tab bar over `spec`'s content, L and R to the next tab. */
export function rootPage(env: Env, tab: Tab, spec: PageSpec, go: (tab: Tab) => void): PageSpec {
  const places = tabPlaces();
  const step = (by: number) => {
    const at = TABS.findIndex((item) => item.id === tab);
    go(TABS[(at + by + TABS.length) % TABS.length]!.id);
  };
  return {
    ...spec,
    title: () => TABS.find((item) => item.id === tab)!.label,
    backLabel: TABS.find((item) => item.id === tab)!.label,
    tint: "flat",
    barColors: BAR,
    titleView: () => <TabBar env={env} tab={tab} />,
    fixedTargets: () => [
      ...(spec.fixedTargets?.() ?? []),
      { id: "tab.account", x: 4, y: 0, w: AVATAR + 12, h: NAV_H, run: () => env.stack.push("account") },
      // the tab that is open opens again: its page from the top
      ...TABS.map((item, index) => ({ id: `tab.${item.id}`, x: places[index]!.x - 2, y: 0, w: places[index]!.w + 4, h: NAV_H, run: () => go(item.id) })),
    ],
    legend: () => [{ button: "lr", label: "Tab" }, ...(spec.legend?.() ?? [])],
    key(pressed) {
      if (spec.key?.(pressed)) return true;
      if (pressed & BTN.LTRIGGER) step(-1);
      else if (pressed & BTN.RTRIGGER) step(1);
      else return false;
      return true;
    },
  };
}

// ---- Home -------------------------------------------------------------------------

interface Shelf {
  id: string;
  title: string;
  items: readonly Item[];
  round: boolean;
  y: number;
  scroller: Scroller;
}

/** A row the d-pad moves along: a row of the grid or a shelf. */
interface Line {
  ids: string[];
  /** Each item's centre, in surface x now. */
  centers(): number[];
  top: number;
  bottom: number;
  shelf?: Shelf;
}

/** The grid's cards, its columns' gap, and the shelves' sizes. */
const CARD_H = 40;
const CARD_GAP = 6;
const GRID_TOP = 8;
const TILE = 72;
const TILE_GAP = 10;
const HEADER_H = 24;
/** A tile's title and subtitle under its cover. */
const TEXT_H = 32;
const SHELF_GAP = 6;
const SHELF_H = HEADER_H + TILE + TEXT_H + SHELF_GAP;

export function homePage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const VIEW_H = viewHeight(env.inset);
  // two columns of cards on a wide tile, one on a narrow one
  const COLUMNS = W >= 400 ? 2 : 1;
  const CARDS = COLUMNS === 2 ? 8 : 4;
  const cardW = (W - S.pad * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS;
  const cardSide = coverSide(CARD_H);
  const tileSide = coverSide(TILE);
  const { model, client } = env;
  const home = model.answers.query("home", () => client.home());
  const scrollers = new Map<string, Scroller>();
  const scrollerFor = (id: string, count: number) => {
    let scroller = scrollers.get(id);
    if (!scroller) {
      scroller = createScroller({ max: () => Math.max(0, S.pad * 2 + count * (TILE + TILE_GAP) - TILE_GAP - W), extent: () => W, overscroll: 40 });
      scrollers.set(id, scroller);
    }
    return scroller;
  };
  onFrame(() => {
    for (const scroller of scrollers.values()) scroller.step();
  });
  const cards = createMemo(() => {
    const value = home.data();
    return value ? jumpBackIn(value.recent, value.playlists, CARDS) : [];
  });
  const gridH = () => {
    const rows = Math.ceil(cards().length / COLUMNS);
    return rows ? GRID_TOP + rows * CARD_H + (rows - 1) * CARD_GAP + 10 : 0;
  };
  const cardX = (index: number) => S.pad + (index % COLUMNS) * (cardW + CARD_GAP);
  const cardY = (index: number) => GRID_TOP + Math.floor(index / COLUMNS) * (CARD_H + CARD_GAP);
  // a shelf with nothing in it is left out, heading and all
  const shelves = createMemo<Shelf[]>(() => {
    const value = home.data();
    if (!value) return [];
    const top = gridH();
    const list = [
      { id: "playlists", title: "Your playlists", items: value.playlists, round: false },
      { id: "albums", title: "Albums", items: value.albums, round: false },
      { id: "artists", title: "Artists", items: value.artists, round: true },
    ].filter((shelf) => shelf.items.length > 0);
    return list.map((shelf, index) => ({ ...shelf, y: top + index * SHELF_H, scroller: scrollerFor(shelf.id, shelf.items.length) }));
  });
  const tileX = (index: number) => S.pad + index * (TILE + TILE_GAP);
  const lit = litFor(env, layer.focus);
  const cardId = (index: number) => `home.grid.${index}`;
  const tileId = (shelf: Shelf, index: number) => `home.${shelf.id}.${index}`;
  // A tile's x is read when a touch asks for targets: the shelf's offset
  // then, not a memo rerun on every frame of a pan.
  const controls = createMemo<Control[]>(() => {
    const out: Control[] = cards().map((item, index) => ({ id: cardId(index), x: cardX(index), y: cardY(index), w: cardW, h: CARD_H, run: () => env.open(item) }));
    for (const shelf of shelves()) {
      shelf.items.forEach((item, index) => {
        out.push({
          id: tileId(shelf, index),
          get x() {
            return tileX(index) - shelf.scroller.offset();
          },
          y: shelf.y + HEADER_H,
          w: TILE,
          h: TILE + TEXT_H,
          run: () => env.open(item),
        });
      });
    }
    return out;
  });
  const empty = () => home.data() !== null && cards().length === 0 && shelves().length === 0;
  const problem = () => (home.data() === null ? home.problem() : null);

  // A sideways pan on a shelf moves that shelf; an up-and-down one goes on
  // to the page's scroller (the touch router), which this one never claims.
  let panning: Scroller | null = null;
  createGesture({
    surface: appletSurfaceId(),
    axis: "x",
    region: { rect: () => (env.stack.top()?.page === "home" && !env.stack.busy() ? { x: 0, y: NAV_H, w: W, h: VIEW_H } : null) },
    onPanStart(contact) {
      const y = contact.startY - NAV_H + layer.offset();
      const shelf = shelves().find((entry) => y >= entry.y + HEADER_H && y < entry.y + HEADER_H + TILE + TEXT_H);
      panning = shelf?.scroller ?? null;
      panning?.beginDrag();
      panning?.drag(-contact.dx);
    },
    onPanMove(contact) {
      panning?.drag(-contact.fdx);
    },
    onPanEnd(contact) {
      panning?.endDrag(-contact.vx);
      panning = null;
    },
    onCancel() {
      panning?.endDrag(0);
      panning = null;
    },
  });

  /** The grid's rows and the shelves, top to bottom. */
  const lines = createMemo<Line[]>(() => {
    const out: Line[] = [];
    const list = cards();
    for (let row = 0; row * COLUMNS < list.length; row++) {
      const indices = list.map((_, index) => index).filter((index) => Math.floor(index / COLUMNS) === row);
      out.push({ ids: indices.map(cardId), centers: () => indices.map((index) => cardX(index) + cardW / 2), top: cardY(indices[0]!), bottom: cardY(indices[0]!) + CARD_H });
    }
    for (const shelf of shelves()) {
      out.push({
        ids: shelf.items.map((_, index) => tileId(shelf, index)),
        centers: () => shelf.items.map((_, index) => tileX(index) + TILE / 2 - shelf.scroller.offset()),
        top: shelf.y,
        bottom: shelf.y + HEADER_H + TILE + TEXT_H,
        shelf,
      });
    }
    return out;
  });

  /** The d-pad: left and right along a row, up and down to the nearest item of the next. */
  const move = (dx: number, dy: number) => {
    const list = lines();
    if (!list.length) return false;
    env.useKeys();
    let row = list.findIndex((line) => line.ids.includes(layer.focus()));
    let index = row >= 0 ? list[row]!.ids.indexOf(layer.focus()) : 0;
    if (row < 0 || !env.keys()) {
      row = Math.max(0, list.findIndex((line) => line.bottom > layer.offset()));
      index = 0;
    } else if (dy !== 0) {
      const x = list[row]!.centers()[index]!;
      row = Math.max(0, Math.min(list.length - 1, row + dy));
      const centers = list[row]!.centers();
      index = centers.reduce((best, center, at) => (Math.abs(center - x) < Math.abs(centers[best]! - x) ? at : best), 0);
    } else {
      index = Math.max(0, Math.min(list[row]!.ids.length - 1, index + dx));
    }
    const line = list[row]!;
    layer.setFocus(line.ids[index]!);
    // the whole row, a shelf with its heading (reveal keeps 8 px around a span)
    layer.reveal(line.top + 8, line.bottom - 8);
    const shelf = line.shelf;
    if (shelf) {
      const left = tileX(index) - S.pad;
      const offset = shelf.scroller.intent();
      if (left < offset) shelf.scroller.chaseTo(left);
      else if (tileX(index) + TILE + S.pad > offset + W) shelf.scroller.chaseTo(tileX(index) + TILE + S.pad - W);
    }
    return true;
  };

  const Grid = () => {
    const titles = createMemo(() => {
      env.faces.revision();
      return cards().map((item) => fit(env.faces, item.title, F.smallBold, cardW - CARD_H - 16, 1));
    });
    return (
      <For each={cards()}>
        {(item, index) => (
          <>
            <View class="absolute" style={{ insetL: cardX(index()), insetT: cardY(index()), width: cardW, height: CARD_H, radius: 4, bgColor: lit(cardId(index())) ? "#3e3e3e" : C.raised }} />
            <Cover covers={env.covers} url={() => item.image} x={cardX(index())} y={cardY(index())} size={CARD_H} side={cardSide} round={item.kind === "artist"} liked={item.kind === "liked"} />
            <Lines fitted={titles()[index()]!} x={cardX(index()) + CARD_H + 9} y={cardY(index()) + (CARD_H - 15) / 2} w={cardW - CARD_H - 16} leading={15} color={C.text} />
          </>
        )}
      </For>
    );
  };

  const ShelfView = (props: { shelf: Shelf }) => {
    let strip!: NodeMirror;
    let at = 0;
    onFrame(() => {
      const x = -Math.round(props.shelf.scroller.offset());
      if (x !== at) jump(strip, "translateX", (at = x));
    });
    const texts = createMemo(() => {
      env.faces.revision();
      return props.shelf.items.map((item) => ({
        title: fit(env.faces, item.title, F.smallBold, TILE, 1),
        subtitle: fit(env.faces, item.kind === "artist" ? "Artist" : item.subtitle, F.small, TILE, 1),
      }));
    });
    return (
      <>
        <Text class="absolute text-base font-bold" style={{ insetL: S.pad, insetT: props.shelf.y + 1, width: W - S.pad * 2, textColor: C.text }}>{props.shelf.title}</Text>
        <View ref={strip} class="absolute left-0" style={{ insetT: props.shelf.y + HEADER_H, width: tileX(props.shelf.items.length) + S.pad, height: TILE + TEXT_H }}>
          <For each={props.shelf.items}>
            {(item, index) => {
              const id = tileId(props.shelf, index());
              return (
                <>
                  <Show when={lit(id)}>
                    <View class="absolute" style={{ insetL: tileX(index()) - 4, insetT: -4, width: TILE + 8, height: TILE + TEXT_H + 4, radius: 6, bgColor: C.lit }} />
                  </Show>
                  <Cover covers={env.covers} url={() => item.image} x={tileX(index())} y={0} size={TILE} side={tileSide} round={props.shelf.round} liked={item.kind === "liked"} />
                  <Lines fitted={texts()[index()]!.title} x={tileX(index())} y={TILE + 4} w={TILE} leading={15} color={C.text} align={props.shelf.round ? "center" : "left"} />
                  <Lines fitted={texts()[index()]!.subtitle} x={tileX(index())} y={TILE + 18} w={TILE} leading={14} color={C.muted} align={props.shelf.round ? "center" : "left"} />
                </>
              );
            }}
          </For>
        </View>
      </>
    );
  };

  const height = () => {
    if (cards().length || shelves().length) return gridH() + shelves().length * SHELF_H;
    return problem() ? 24 + messageHeight(problem()!.detail, W, true) : empty() ? 24 + messageHeight(EMPTY, W, false) : 160;
  };
  const content = listContent({
    env,
    layer,
    width: W,
    view: VIEW_H,
    head: {
      height,
      controls: () => {
        const failed = problem();
        if (failed) return [{ id: "home.retry", x: (W - 150) / 2, y: messageButtonY(24, failed.detail, W), w: 150, h: 32, run: home.reload }];
        return controls();
      },
      view: () => (
        <>
          <Grid />
          <For each={shelves()}>{(shelf) => <ShelfView shelf={shelf} />}</For>
          <Show when={problem()}>{(failed) => <Message w={W} top={24} title={failed().title} detail={failed().detail} button={{ id: "home.retry", label: "Try Again" }} lit={lit} />}</Show>
          <Show when={empty()}>
            <Message w={W} top={24} title="Nothing here yet" detail={EMPTY} />
          </Show>
          <Show when={home.data() === null && !problem()}>
            <Message w={W} top={40} title="Loading" spinner />
          </Show>
        </>
      ),
    },
    rows: () => [],
  });

  return {
    title: () => "Home",
    inset: env.inset,
    content,
    activateLabel: () => "Open",
    legend: () => [{ button: "dpad-h", label: "Shelf" }],
    key(pressed) {
      if (pressed & BTN.LEFT) return move(-1, 0);
      if (pressed & BTN.RIGHT) return move(1, 0);
      if (pressed & BTN.UP) return move(0, -1);
      if (pressed & BTN.DOWN) return move(0, 1);
      if (pressed & BTN.TRIANGLE) {
        home.reload();
        return true;
      }
      return false;
    },
  };
}

const EMPTY = "Play something in Spotify, save albums and follow artists: they show here.";
