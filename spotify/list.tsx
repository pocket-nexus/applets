// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/list.tsx — a page's scrolling content: a static block at the top
// (a page's head, a search field, chips), rows drawn by a fixed pool of
// slots (ui/slots.ts), so a list of any length scrolls at the same cost, and
// a static block after them (loading more, empty, a note).
//
// A row is a track (its place on the album or its cover, the title, the
// artists with an E for explicit, the length), an item (a cover, round for
// an artist, a title and what it is), or a section's heading. The painter
// moves a slot and rewrites the few texts and pictures that differ; the row
// the player has draws its title green.

import { batch, createEffect, createMemo, createSignal, For, onMount, Show, untrack, type Accessor, type JSX } from "solid-js";
import { jump } from "@pocketjs/framework/animation";
import { Image, Text, View } from "@pocketjs/framework/components";
import { getOps } from "@pocketjs/framework/host";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import type { LayerContext, PageContent } from "../ui/nav.tsx";
import { barsFor, lazyBars, SkeletonBars, type Bar } from "../ui/skeleton.tsx";
import { createSlotPool, paintText, type PlacedRow, type SlotPool } from "../ui/slots.ts";
import { FONT, measure } from "../ui/text.ts";
import type { Target } from "../ui/touch.ts";
import { coverSide } from "./api.ts";
import type { Item } from "./contract.ts";
import { clock } from "./format.ts";
import { ICON } from "./icons.ts";
import { controlTargets, type Control, type Env } from "./parts.tsx";
import { fit, type Fitted } from "./text.ts";
import { C, F, S } from "./theme.ts";

/** Font slot and line height (contracts/spec/spec.ts PROP). */
const PROP_FONT_SLOT = 97;
const PROP_LINE_HEIGHT = 99;
const OVERSCAN = 80;
const MIN_ROW = 30;
/** The classes that make the compiler bake every face a slot switches to. */
const FACES = ["text-base font-bold", "text-sm", "text-xs", "text-xs font-bold"];
void FACES;

export type Lead = "number" | "cover" | "round" | "liked" | "none";

export interface Row extends PlacedRow {
  key: string;
  kind: "track" | "item" | "section";
  item: Item | null;
  lead: Lead;
  number: string;
  title: Fitted;
  subtitle: Fitted;
  explicit: boolean;
  trailing: string;
  /** Spotify cannot play it here. */
  dim: boolean;
  textX: number;
  titleY: number;
  run?: () => void;
}

/** Rows are dense, as on Spotify's desktop client: a 32 px cover, a 14 px
 *  title over a 12 px subtitle; seven or eight show in a 346 px window. */
const ROW_H = { number: 38, cover: 40, round: 40, liked: 40, none: 36 } as const;
const COVER = { number: 0, cover: 32, round: 32, liked: 32, none: 0 } as const;
const SECTION_H = 30;
/** The title's line and the subtitle's under it. */
const TITLE_LEADING = 16;
const SUBTITLE_LEADING = 15;
/** The explicit badge and the gap after it. */
const BADGE = 14;
const BADGE_W = BADGE + 4;
/** The texture side for a row's cover. */
let ROW_SIDE = 64;

export interface RowOptions {
  lead: Lead;
  /** A track's number: its place on the album (trackNumber). */
  numbered?: boolean;
  /** What the subtitle says; the item's own subtitle when absent. */
  subtitle?: (item: Item) => string;
  run?: (item: Item, index: number) => void;
  /** The row's key prefix, unique on the page. */
  prefix: string;
}

/** Rows for `items` from content y `top`, laid out in `width`. Read inside
 *  a memo that reads `faces.revision()`. */
export function itemRows(env: Env, items: readonly Item[], top: number, width: number, options: RowOptions): Row[] {
  const lead = options.lead;
  const h = ROW_H[lead];
  const cover = COVER[lead];
  const textX = lead === "number" ? S.pad + 22 + 8 : lead === "none" ? S.pad : S.pad + cover + 10;
  const titleY = Math.round((h - TITLE_LEADING - SUBTITLE_LEADING) / 2);
  return items.map((item, index): Row => {
    const trailing = item.kind === "track" || item.kind === "episode" ? clock(item.durationMs ?? 0) : "";
    const trailingW = trailing ? Math.ceil(measure(trailing, FONT.xs)) + 10 : 0;
    const textW = Math.max(40, width - textX - S.pad - trailingW);
    const explicit = item.explicit === true;
    const subtitle = options.subtitle ? options.subtitle(item) : item.subtitle;
    return {
      key: `${options.prefix}.${index}.${item.uri}`,
      kind: item.kind === "track" || item.kind === "episode" ? "track" : "item",
      item,
      lead: item.kind === "liked" ? "liked" : lead,
      number: options.numbered ? String(item.trackNumber ?? index + 1) : "",
      title: fit(env.faces, item.title, F.body, textW),
      subtitle: fit(env.faces, subtitle, F.small, textW - (explicit ? BADGE_W : 0)),
      explicit,
      trailing,
      dim: item.playable === false,
      textX,
      titleY,
      y: top + index * h,
      h,
      content: "",
      run: options.run ? () => options.run!(item, index) : undefined,
    };
  }).map((row) => ((row.content = painted(row)), row));
}

/** What a slot paints for a row, as one string: a row with the same one is
 *  only moved (ui/slots.ts), and one whose glyphs arrived is painted again. */
function painted(row: Row): string {
  const text = (fitted: Fitted) => `${fitted.slot}:${fitted.skeleton ? fitted.skeleton.join(",") : fitted.lines.join("\n")}`;
  return `${row.key}|${row.number}|${text(row.title)}|${text(row.subtitle)}|${row.trailing}|${row.explicit}|${row.dim}|${row.lead}|${row.item?.image ?? ""}`;
}

/** A section's heading as a row. */
export function sectionRow(env: Env, key: string, text: string, top: number, width: number): Row {
  const row: Row = {
    key,
    kind: "section",
    item: null,
    lead: "none",
    number: "",
    title: fit(env.faces, text, F.h3, width - S.pad * 2),
    subtitle: { lines: [""], slot: F.small },
    explicit: false,
    trailing: "",
    dim: false,
    textX: S.pad,
    titleY: 8,
    y: top,
    h: SECTION_H,
    content: "",
  };
  row.content = painted(row);
  return row;
}

/** A row's skeleton bars: the title's and the subtitle's. */
function rowBars(row: Row): Bar[] {
  const subX = row.textX + (row.explicit ? BADGE_W : 0);
  return [
    ...(row.title.skeleton ? barsFor(row.title.skeleton, row.textX, row.titleY, TITLE_LEADING, 13) : []),
    ...(row.subtitle.skeleton ? barsFor(row.subtitle.skeleton, subX, row.titleY + TITLE_LEADING, SUBTITLE_LEADING, 13) : []),
  ];
}

function Slot(props: { env: Env; pool: SlotPool<Row>; slot: number; width: number; lit: (key: string) => boolean }) {
  const { env } = props;
  let box!: NodeMirror;
  let wash!: NodeMirror;
  let number!: NodeMirror;
  let back!: NodeMirror;
  let cover!: NodeMirror;
  let title!: NodeMirror;
  let badge!: NodeMirror;
  let subtitle!: NodeMirror;
  let trailing!: NodeMirror;
  const [key, setKey] = createSignal("");
  const [uri, setUri] = createSignal("");
  const [art, setArt] = createSignal<{ url: string; round: boolean } | null>(null);
  const [hasBars, setHasBars] = createSignal(false);
  const [liked, setLiked] = createSignal(false);
  const bars = lazyBars(() => setHasBars(true));
  let y = -1;
  let h = -1;
  let dim = false;
  let section = false;
  const playing = createMemo(() => uri() !== "" && env.model.player()?.item?.uri === uri());
  const show = (node: NodeMirror, on: boolean) => jump(node, "opacity", on ? 1 : 0);
  const setFont = (node: NodeMirror, slot: number, leading: number) => {
    const ops = getOps();
    ops.setProp(node.id, PROP_FONT_SLOT, slot);
    ops.setProp(node.id, PROP_LINE_HEIGHT, leading);
  };
  onMount(() => {
    createEffect(() => show(wash, key() !== "" && props.lit(key())));
    createEffect(() => {
      const on = playing();
      if (!section) jump(title, "textColor", on ? C.accent : dim ? C.faint : C.text);
    });
    createEffect(() => {
      env.covers.revision();
      const shown = art();
      getOps().setImage(cover.id, shown ? env.covers.texture(shown.url, ROW_SIDE, shown.round) : -1);
    });
    props.pool.attach(props.slot, (row, moved) => batch(() => {
      if (!row) {
        if (y >= 0) jump(box, "opacity", 0);
        y = -1;
        setKey("");
        setUri("");
        setArt(null);
        bars.paint([]);
        return;
      }
      if (y < 0) jump(box, "opacity", 1);
      if (row.y !== y) jump(box, "translateY", (y = row.y));
      if (row.h !== h) {
        jump(box, "height", (h = row.h));
        jump(wash, "height", h);
      }
      setKey(row.run ? row.key : "");
      if (moved) return;
      section = row.kind === "section";
      dim = row.dim;
      bars.paint(rowBars(row));
      setUri(row.item && !section ? row.item.uri : "");
      // title
      jump(title, "insetL", row.textX);
      jump(title, "insetT", row.titleY);
      setFont(title, row.title.slot, section ? 20 : TITLE_LEADING);
      jump(title, "textColor", section ? C.text : playing() ? C.accent : row.dim ? C.faint : C.text);
      paintText(title, row.title.lines[0] ?? "");
      // subtitle, after the explicit badge
      const subX = row.textX + (row.explicit ? BADGE_W : 0);
      jump(subtitle, "insetL", subX);
      jump(subtitle, "insetT", row.titleY + TITLE_LEADING);
      setFont(subtitle, row.subtitle.slot, SUBTITLE_LEADING);
      paintText(subtitle, section ? "" : row.subtitle.lines[0] ?? "");
      show(badge, row.explicit);
      if (row.explicit) {
        jump(badge, "insetL", row.textX);
        jump(badge, "insetT", row.titleY + TITLE_LEADING);
      }
      // the lead: a number, a cover, or Liked Songs' heart
      paintText(number, row.lead === "number" ? row.number : "");
      jump(number, "insetT", (row.h - 17) / 2);
      const size = COVER[row.lead];
      const hasCover = size > 0 && row.lead !== "liked";
      show(back, size > 0);
      if (size > 0) {
        jump(back, "width", size);
        jump(back, "height", size);
        jump(back, "insetT", (row.h - size) / 2);
        jump(back, "radius", row.lead === "round" ? size / 2 : 3);
        jump(back, "bgColor", C.placeholder);
        jump(cover, "width", size);
        jump(cover, "height", size);
        jump(cover, "insetT", (row.h - size) / 2);
      }
      setLiked(row.lead === "liked");
      setArt(hasCover && row.item?.image ? { url: row.item.image, round: row.lead === "round" } : null);
      paintText(trailing, row.trailing);
      jump(trailing, "insetL", props.width - S.pad - Math.ceil(measure(row.trailing, FONT.xs)));
      jump(trailing, "insetT", (row.h - 15) / 2);
    }));
  });
  return (
    <View ref={box} class="absolute left-0 top-0 opacity-0" style={{ width: props.width, height: MIN_ROW }}>
      <View ref={wash} class="absolute left-0 top-0 opacity-0" style={{ width: props.width, height: MIN_ROW, bgColor: C.lit }} />
      <Text ref={number} class="absolute text-sm text-center" style={{ insetL: S.pad, insetT: 10, width: 22, textColor: C.muted }}>{" "}</Text>
      <View ref={back} class="absolute opacity-0" style={{ insetL: S.pad, insetT: 4, width: 32, height: 32, radius: 3, bgColor: C.placeholder }} />
      <Show when={liked()}>
        <View class="absolute" style={{ insetL: S.pad, insetT: 4, width: 32, height: 32, radius: 3, gradDir: 1, gradFrom: "#4b17e6", gradTo: "#8fc3cf" }} />
        <Image class="absolute w-[16] h-[16]" src={ICON["heart-fill"].white24} style={{ insetL: S.pad + 8, insetT: 12 }} />
      </Show>
      <Image ref={cover} class="absolute" style={{ insetL: S.pad, insetT: 4, width: 32, height: 32 }} />
      <Text ref={title} class="absolute text-sm" style={{ textColor: C.text }}>{" "}</Text>
      <View ref={badge} class="absolute opacity-0" style={{ width: BADGE, height: BADGE, radius: 2, bgColor: C.muted }}>
        <Text class="absolute left-0 top-[-1] w-[14] text-xs font-bold text-center" style={{ textColor: C.black }}>E</Text>
      </View>
      <Text ref={subtitle} class="absolute text-xs" style={{ textColor: C.muted }}>{" "}</Text>
      <Text ref={trailing} class="absolute text-xs" style={{ textColor: C.muted }}>{" "}</Text>
      <Show when={hasBars()}>
        <SkeletonBars color={C.skeleton} ready={bars.ready} />
      </Show>
    </View>
  );
}

/** A static part of a page: drawn once, with its controls. */
export interface Block {
  height: Accessor<number>;
  view: () => JSX.Element;
  controls: Accessor<readonly Control[]>;
}

export interface ListOptions {
  env: Env;
  layer: LayerContext;
  width: number;
  /** The list's visible height. */
  view: number;
  head?: Block;
  /** The rows, placed from the head's foot (`top`). */
  rows: (top: number) => Row[];
  /** What follows the rows, from content y `top`. */
  foot?: (top: Accessor<number>) => Block;
  /** The reader is near the end: ask for more. */
  onEnd?: () => void;
}

/** The nav stack's PageContent for a head, rows and a foot. */
export function listContent(options: ListOptions): PageContent {
  const { env, layer } = options;
  ROW_SIDE = coverSide(44);
  const headH = () => options.head?.height() ?? 0;
  const rows = createMemo(() => {
    env.faces.revision();
    return options.rows(headH());
  });
  const rowsEnd = () => {
    const list = rows();
    const last = list[list.length - 1];
    return last ? last.y + last.h : headH();
  };
  const foot = options.foot?.(rowsEnd);
  const height = () => rowsEnd() + (foot?.height() ?? 0) + 12;
  const lit = (key: string) => env.press.is(key) || (env.keys() && layer.focus() === key);
  const slots = () => {
    const pool = createSlotPool<Row>(rows, layer.offset, { view: options.view, overscan: OVERSCAN, minRowH: MIN_ROW });
    return <For each={pool.slots}>{(slot) => <Slot env={env} pool={pool} slot={slot} width={options.width} lit={lit} />}</For>;
  };
  if (options.onEnd) onFrame(() => {
    if (layer.offset() + options.view * 2 > rowsEnd()) options.onEnd!();
  });
  const controls = createMemo(() => [...(options.head?.controls() ?? []), ...(foot?.controls() ?? [])]);
  const runs = createMemo(() => {
    const map = new Map<string, { run: () => void; top: number; bottom: number }>();
    for (const c of options.head?.controls() ?? []) map.set(c.id, { run: c.run, top: c.y, bottom: c.y + c.h });
    for (const row of rows()) if (row.run) map.set(row.key, { run: row.run, top: row.y, bottom: row.y + row.h });
    for (const c of foot?.controls() ?? []) map.set(c.id, { run: c.run, top: c.y, bottom: c.y + c.h });
    return map;
  });
  return {
    view: () => (
      <>
        {options.head?.view()}
        <Show when={layer.near()}>{untrack(slots)}</Show>
        {foot?.view()}
      </>
    ),
    height,
    focusOrder: () => [...runs().keys()],
    targets(top, offset, bottom) {
      const out: Target[] = controlTargets(controls(), top, offset, bottom);
      for (const row of rows()) {
        if (!row.run) continue;
        const y = top + row.y - offset;
        if (y + row.h <= top || y >= bottom) continue;
        out.push({ id: row.key, x: 0, y, w: options.width, h: row.h, run: row.run });
      }
      return out;
    },
    span(id) {
      const found = runs().get(id);
      return found ? [found.top, found.bottom] : null;
    },
    activate: (id) => runs().get(id)?.run(),
  };
}
