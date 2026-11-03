// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/home.tsx — the three root pages' bar (the account's picture, then
// Home, Search and Library as chips; L and R step through them) and Home:
// what was played lately, the owner's playlists with Liked Songs first,
// saved albums and followed artists, each a shelf of covers that pans
// sideways under a finger and steps with the d-pad's left and right.

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
import { appletSurfaceId, SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { coverSide } from "./api.ts";
import type { Item } from "./contract.ts";
import { listContent } from "./list.tsx";
import { Cover, Heading, Lines, litFor, Message, messageButtonY, messageHeight, type Control, type Env } from "./parts.tsx";
import { fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

export type Tab = "home" | "search" | "library";
export const TABS: readonly { id: Tab; label: string; w: number }[] = [
  { id: "home", label: "Home", w: 58 },
  { id: "search", label: "Search", w: 64 },
  { id: "library", label: "Library", w: 66 },
];
const AVATAR = 26;
const TABS_X = 10 + AVATAR + 10;

/** The bar of a root page: the account's picture and the three tabs. */
function TabBar(props: { env: Env; tab: Tab }) {
  const user = () => props.env.model.status()?.user ?? null;
  const x = (index: number) => TABS_X + TABS.slice(0, index).reduce((sum, tab) => sum + tab.w + 6, 0);
  return (
    <>
      <Cover covers={props.env.covers} url={() => user()?.image ?? ""} x={10} y={5} size={AVATAR} side={coverSide(AVATAR)} round />
      <Show when={props.env.press.is("tab.account")}>
        <View class="absolute" style={{ insetL: 10, insetT: 5, width: AVATAR, height: AVATAR, radius: AVATAR / 2, bgColor: "#ffffff40" }} />
      </Show>
      <For each={TABS}>
        {(tab, index) => (
          <>
            <View class="absolute" style={{ insetL: x(index()), insetT: 5, width: tab.w, height: 26, radius: 13, bgColor: props.tab === tab.id ? C.accent : props.env.press.is(`tab.${tab.id}`) ? "#3e3e3e" : C.raised }} />
            <Text class="absolute text-xs font-bold text-center" style={{ insetL: x(index()), insetT: 11, width: tab.w, textColor: props.tab === tab.id ? C.black : C.text }}>{tab.label}</Text>
          </>
        )}
      </For>
    </>
  );
}

/** A root page: the tab bar over `spec`'s content, L and R to the next tab. */
export function rootPage(env: Env, tab: Tab, spec: PageSpec, go: (tab: Tab) => void): PageSpec {
  const x = (index: number) => TABS_X + TABS.slice(0, index).reduce((sum, item) => sum + item.w + 6, 0);
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
      ...TABS.map((item, index) => ({ id: `tab.${item.id}`, x: x(index) - 3, y: 0, w: item.w + 6, h: NAV_H, run: () => go(item.id) })),
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


export function homePage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const VIEW_H = viewHeight(env.inset);
  // a shelf fits the band between the bar and the mini player
  const TILE = W >= 440 && SCREEN_H >= 300 ? 112 : SCREEN_H < 300 ? 80 : 92;
  const HEADER_H = SCREEN_H < 300 ? 34 : 40;
  /** A tile's title and subtitle under its cover. */
  const TEXT_H = SCREEN_H < 300 ? 40 : 44;
  const GAP = 12;
  const SHELF_H = HEADER_H + TILE + TEXT_H;
  const side = coverSide(TILE);
  const { model, client } = env;
  const home = model.answers.query("home", () => client.home());
  const scrollers = new Map<string, Scroller>();
  const scrollerFor = (id: string, count: number) => {
    let scroller = scrollers.get(id);
    if (!scroller) {
      scroller = createScroller({ max: () => Math.max(0, S.pad * 2 + count * (TILE + GAP) - GAP - W), extent: () => W, overscroll: 40 });
      scrollers.set(id, scroller);
    }
    return scroller;
  };
  onFrame(() => {
    for (const scroller of scrollers.values()) scroller.step();
  });
  const shelves = createMemo<Shelf[]>(() => {
    const value = home.data();
    if (!value) return [];
    const list = [
      { id: "recent", title: "Recently played", items: value.recent, round: false },
      { id: "playlists", title: "Your playlists", items: value.playlists, round: false },
      { id: "albums", title: "Albums", items: value.albums, round: false },
      { id: "artists", title: "Artists", items: value.artists, round: true },
    ].filter((shelf) => shelf.items.length > 0);
    return list.map((shelf, index) => ({ ...shelf, y: index * SHELF_H, scroller: scrollerFor(shelf.id, shelf.items.length) }));
  });
  const tileX = (index: number) => S.pad + index * (TILE + GAP);
  const lit = litFor(env, layer.focus);
  const tileId = (shelf: Shelf, index: number) => `home.${shelf.id}.${index}`;
  // A tile's x is read when a touch asks for targets: the shelf's offset
  // then, not a memo rerun on every frame of a pan.
  const controls = createMemo<Control[]>(() => {
    const out: Control[] = [];
    for (const shelf of shelves()) {
      shelf.items.forEach((item, index) => {
        out.push({
          id: tileId(shelf, index),
          get x() {
            return tileX(index) - shelf.scroller.offset();
          },
          y: shelf.y + HEADER_H,
          w: TILE,
          h: TILE + TEXT_H - 6,
          run: () => env.open(item),
        });
      });
    }
    return out;
  });
  const empty = () => home.data() !== null && shelves().length === 0;
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

  /** The d-pad: left and right along a shelf, up and down between shelves. */
  const move = (dx: number, dy: number) => {
    const list = shelves();
    if (!list.length) return false;
    env.useKeys();
    const [, shelfId, at] = layer.focus().split(".");
    let row = list.findIndex((shelf) => shelf.id === shelfId);
    let index = Number(at ?? 0);
    if (row < 0 || !env.keys()) {
      row = Math.max(0, list.findIndex((shelf) => shelf.y + SHELF_H > layer.offset()));
      index = 0;
    } else if (dy !== 0) {
      row = Math.max(0, Math.min(list.length - 1, row + dy));
      index = Math.min(index, list[row]!.items.length - 1);
    } else {
      index = Math.max(0, Math.min(list[row]!.items.length - 1, index + dx));
    }
    const shelf = list[row]!;
    layer.setFocus(tileId(shelf, index));
    // the whole shelf, its heading first (reveal keeps 8 px around a span)
    layer.reveal(shelf.y + 8, shelf.y + SHELF_H - 8);
    const left = tileX(index) - S.pad;
    const offset = shelf.scroller.intent();
    if (left < offset) shelf.scroller.chaseTo(left);
    else if (tileX(index) + TILE + S.pad > offset + W) shelf.scroller.chaseTo(tileX(index) + TILE + S.pad - W);
    return true;
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
        <Heading x={S.pad} y={props.shelf.y + HEADER_H - 30} w={W - S.pad * 2} text={props.shelf.title} />
        <View ref={strip} class="absolute left-0" style={{ insetT: props.shelf.y + HEADER_H, width: tileX(props.shelf.items.length) + S.pad, height: TILE + TEXT_H }}>
          <For each={props.shelf.items}>
            {(item, index) => {
              const id = tileId(props.shelf, index());
              return (
                <>
                  <Show when={lit(id)}>
                    <View class="absolute" style={{ insetL: tileX(index()) - 6, insetT: -6, width: TILE + 12, height: TILE + TEXT_H, radius: 6, bgColor: C.lit }} />
                  </Show>
                  <Cover covers={env.covers} url={() => item.image} x={tileX(index())} y={0} size={TILE} side={side} round={props.shelf.round} liked={item.kind === "liked"} />
                  <Lines fitted={texts()[index()]!.title} x={tileX(index())} y={TILE + 6} w={TILE} leading={18} color={C.text} align={props.shelf.round ? "center" : "left"} />
                  <Lines fitted={texts()[index()]!.subtitle} x={tileX(index())} y={TILE + 24} w={TILE} leading={16} color={C.muted} align={props.shelf.round ? "center" : "left"} />
                </>
              );
            }}
          </For>
        </View>
      </>
    );
  };

  const height = () => {
    if (shelves().length) return shelves().length * SHELF_H;
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
