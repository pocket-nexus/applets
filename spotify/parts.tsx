// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/parts.tsx — what the pages draw with: what every page reaches
// (Env), text lines fitted by spotify/text.ts, cover art, the round Play
// button, pill buttons, icon buttons, a centred message, and the controls a
// static block of a page lays out (each a hit target, a d-pad stop and a
// span to scroll into view).
//
// Everything is placed by arithmetic, as the rest of the applets' pages are:
// a control's numbers draw it and name its hit rectangle (ui/touch.ts).

import { createEffect, For, Show, type Accessor, type JSX } from "solid-js";
import { ClassicSpinner } from "@pocketjs/framework/classic";
import { Image, Text, View } from "@pocketjs/framework/components";
import { getOps } from "@pocketjs/framework/host";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import type { NavStack } from "../ui/nav.tsx";
import { barsFor } from "../ui/skeleton.tsx";
import { FONT, wrap } from "../ui/text.ts";
import type { Press, Target } from "../ui/touch.ts";
import type { Covers, SpotifyClient } from "./api.ts";
import type { Item } from "./contract.ts";
import { ICON } from "./icons.ts";
import type { SpotifyModel } from "./model.ts";
import type { Faces, Fitted } from "./text.ts";
import { C } from "./theme.ts";

export interface Env {
  model: SpotifyModel;
  client: SpotifyClient;
  covers: Covers;
  faces: Faces;
  press: Press;
  keys: Accessor<boolean>;
  /** The d-pad took over: focus shows. */
  useKeys(): void;
  stack: NavStack;
  /** The keyboard's text with its caret while it edits `field`, else null. */
  draft(field: "search"): string | null;
  /** Open the keyboard on a field. */
  edit(field: "search"): void;
  /** Px along the bottom the mini player or the Premium note covers now. */
  bottom: Accessor<number>;
  /** Px a signed-in page keeps free along its bottom for them (PageSpec.inset). */
  inset: number;
  /** Ask before something that cannot be undone. */
  confirm(alert: { title: string; message: string; action: string; run: () => void }): void;
  /** Open an item's page, or play a track. */
  open(item: Item, context?: string): void;
}

/** A control in a page's static block: drawn and hit-tested by the same
 *  numbers, in content px. */
export interface Control {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  run: () => void;
}

/** The controls' hit targets for content drawn at `top`, scrolled by `offset`. */
export function controlTargets(controls: readonly Control[], top: number, offset: number, bottom: number): Target[] {
  const out: Target[] = [];
  for (const c of controls) {
    const y = top + c.y - offset;
    if (y + c.h <= top || y >= bottom) continue;
    out.push({ id: c.id, x: c.x, y, w: c.w, h: c.h, run: c.run });
  }
  return out;
}

/** Lit: pressed, or holding the d-pad's focus. */
export const litFor = (env: Env, focus: Accessor<string>) => (id: string) => env.press.is(id) || (env.keys() && focus() === id);

/** Fitted lines drawn from (x, y), `leading` apart; skeleton bars while
 *  their glyphs are on their way. */
export function Lines(props: { fitted: Fitted; x: number; y: number; w: number; leading: number; color: string; align?: "left" | "center"; bold?: boolean }) {
  const em = 13;
  const bars = () => (props.fitted.skeleton ? barsFor(props.fitted.skeleton, props.align === "center" ? props.x + (props.w - Math.max(...props.fitted.skeleton)) / 2 : props.x, props.y, props.leading, em) : []);
  return (
    <>
      <Show when={!props.fitted.skeleton}>
        <For each={props.fitted.lines}>
          {(line, index) => (
            <Text
              class={props.align === "center" ? "absolute text-sm text-center" : "absolute text-sm"}
              style={{ insetL: props.x, insetT: props.y + index() * props.leading, width: props.w, textColor: props.color, fontSlot: props.fitted.slot }}
            >
              {line || " "}
            </Text>
          )}
        </For>
      </Show>
      <For each={bars()}>{(bar) => <View class="absolute" style={{ insetL: bar.x, insetT: bar.y, width: bar.w, height: bar.h, radius: Math.floor(bar.h / 2), bgColor: C.skeleton }} />}</For>
    </>
  );
}

/** Cover art at (x, y): a square with a little rounding, or a circle for an
 *  artist. A placeholder with a note or a person until it arrives. */
export function Cover(props: { covers: Covers; url: Accessor<string>; x: number; y: number; size: number; side: number; round?: boolean; liked?: boolean }) {
  let image!: NodeMirror;
  createEffect(() => {
    props.covers.revision();
    const url = props.url();
    getOps().setImage(image.id, url ? props.covers.texture(url, props.side, props.round) : -1);
  });
  const icon = props.size >= 48 ? (props.round ? ICON.person.muted24 : ICON.note.muted24) : props.round ? ICON.person.muted16 : ICON.note.muted16;
  const iconSize = props.size >= 48 ? 24 : 16;
  return (
    <>
      <Show
        when={props.liked}
        fallback={<View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: props.round ? props.size / 2 : 4, bgColor: C.placeholder }} />}
      >
        <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: 4, gradDir: 1, gradFrom: "#4b17e6", gradTo: "#8fc3cf" }} />
        <Image class="absolute" src={props.size >= 72 ? ICON["heart-fill"].white32 : ICON["heart-fill"].white24} style={{ insetL: props.x + (props.size - (props.size >= 72 ? 32 : 24)) / 2, insetT: props.y + (props.size - (props.size >= 72 ? 32 : 24)) / 2, width: props.size >= 72 ? 32 : 24, height: props.size >= 72 ? 32 : 24 }} />
      </Show>
      <Show when={!props.liked && !props.url()}>
        <Image class="absolute" src={icon} style={{ insetL: props.x + (props.size - iconSize) / 2, insetT: props.y + (props.size - iconSize) / 2, width: iconSize, height: iconSize }} />
      </Show>
      <Image ref={image} class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size }} />
    </>
  );
}

/** The round green Play button, with a pause bar pair while `playing`. */
export function PlayButton(props: { x: number; y: number; size: number; playing: Accessor<boolean>; lit: Accessor<boolean> }) {
  const icon = () => (props.size >= 48 ? (props.playing() ? ICON.pause.black24 : ICON.play.black24) : props.playing() ? ICON.pause.black20 : ICON.play.black20);
  const iconSize = props.size >= 48 ? 24 : 20;
  return (
    <>
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: props.size / 2, bgColor: props.lit() ? C.accentLit : C.accent }} />
      <Image class="absolute" src={icon()} style={{ insetL: props.x + (props.size - iconSize) / 2 + (props.playing() ? 0 : 1), insetT: props.y + (props.size - iconSize) / 2, width: iconSize, height: iconSize }} />
    </>
  );
}

/** A round white button with a black icon: Now Playing's play and pause. */
export function BigToggle(props: { x: number; y: number; size: number; playing: Accessor<boolean>; lit: Accessor<boolean> }) {
  return (
    <>
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: props.size / 2, bgColor: props.lit() ? C.muted : C.white }} />
      <Image class="absolute" src={props.playing() ? ICON.pause.black24 : ICON.play.black24} style={{ insetL: props.x + (props.size - 24) / 2 + (props.playing() ? 0 : 1), insetT: props.y + (props.size - 24) / 2, width: 24, height: 24 }} />
    </>
  );
}

/** A pill with a label: `primary` green with black words, else an outline. */
export function Pill(props: { x: number; y: number; w: number; h?: number; label: string; primary?: boolean; lit: Accessor<boolean> }) {
  const h = props.h ?? 32;
  return (
    <>
      <Show
        when={props.primary}
        fallback={<View class="absolute border" style={{ insetL: props.x, insetT: props.y, width: props.w, height: h, radius: h / 2, borderColor: props.lit() ? C.text : C.faint, bgColor: props.lit() ? C.lit : "#00000000" }} />}
      >
        <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.w, height: h, radius: h / 2, bgColor: props.lit() ? C.accentLit : C.accent }} />
      </Show>
      <Text class="absolute text-sm font-bold text-center" style={{ insetL: props.x, insetT: props.y + (h - 17) / 2, width: props.w, textColor: props.primary ? C.black : C.text }}>{props.label}</Text>
    </>
  );
}

/** A chip's height: a row of chips takes 30 px with its gap. */
export const CHIP_H = 24;

/** A chip of a row of choices (Playlists, Albums…): green when chosen. */
export function Chip(props: { x: number; y: number; w: number; label: string; on: Accessor<boolean>; lit: Accessor<boolean> }) {
  return (
    <>
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.w, height: CHIP_H, radius: CHIP_H / 2, bgColor: props.on() ? C.accent : props.lit() ? "#3e3e3e" : C.raised }} />
      <Text class="absolute text-xs text-center" style={{ insetL: props.x, insetT: props.y + (CHIP_H - 15) / 2, width: props.w, textColor: props.on() ? C.black : C.text }}>{props.label}</Text>
    </>
  );
}

/** An icon centred in a `w` x `h` box that lights while pressed. */
export function IconButton(props: { x: number; y: number; w: number; h: number; icon: Accessor<string>; size: number; lit: Accessor<boolean> }) {
  return (
    <>
      <Show when={props.lit()}>
        <View class="absolute" style={{ insetL: props.x + (props.w - Math.min(props.w, props.h)) / 2, insetT: props.y, width: Math.min(props.w, props.h), height: Math.min(props.w, props.h), radius: Math.min(props.w, props.h) / 2, bgColor: "#ffffff1f" }} />
      </Show>
      <Image class="absolute" src={props.icon()} style={{ insetL: props.x + (props.w - props.size) / 2, insetT: props.y + (props.h - props.size) / 2, width: props.size, height: props.size }} />
    </>
  );
}

/** A centred title, a few lines under it and a button: loading, empty,
 *  failed, signed out. `top` is where it starts in content px. */
export function Message(props: { x?: number; w: number; top: number; title: string; detail?: string; spinner?: boolean; button?: { id: string; label: string; primary?: boolean }; lit?: (id: string) => boolean }) {
  const x = () => props.x ?? 0;
  const lines = () => (props.detail ? wrap(props.detail, FONT.xs, Math.min(300, props.w - 32), 4) : []);
  const textW = () => Math.min(300, props.w - 32);
  const spin = () => (props.spinner ? 34 : 0);
  return (
    <>
      <Show when={props.spinner}>
        <View class="absolute" style={{ insetL: x() + props.w / 2 - 11, insetT: props.top }}>
          <ClassicSpinner size={22} color={C.muted} />
        </View>
      </Show>
      <Text class="absolute text-base font-bold text-center" style={{ insetL: x() + 8, insetT: props.top + spin(), width: props.w - 16, textColor: C.text }}>{props.title}</Text>
      <For each={lines()}>
        {(line, index) => <Text class="absolute text-xs text-center" style={{ insetL: x() + (props.w - textW()) / 2, insetT: props.top + spin() + 24 + index() * 16, width: textW(), textColor: C.muted }}>{line}</Text>}
      </For>
      <Show when={props.button}>
        {(button) => <Pill x={x() + (props.w - 150) / 2} y={messageButtonY(props.top, props.detail, props.w, !!props.spinner)} w={150} label={button().label} primary={button().primary} lit={() => props.lit?.(button().id) ?? false} />}
      </Show>
    </>
  );
}

/** Where a Message puts its button, for its hit target. */
export function messageButtonY(top: number, detail: string | undefined, w: number, spinner = false): number {
  const lines = detail ? wrap(detail, FONT.xs, Math.min(300, w - 32), 4).length : 0;
  return top + (spinner ? 34 : 0) + 24 + lines * 16 + 12;
}

/** The Message's height with its button. */
export function messageHeight(detail: string | undefined, w: number, button: boolean, spinner = false): number {
  return messageButtonY(0, detail, w, spinner) + (button ? 32 + 12 : 0);
}

export type Children = JSX.Element;
