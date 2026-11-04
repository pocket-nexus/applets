// SPDX-License-Identifier: GPL-3.0-or-later
// pocket-applet: draws its own pixels because the player is cover art, a seek bar that follows a finger and transport controls.
// spotify/player.tsx — Now Playing and the mini player.
//
// Now Playing: the cover, the title, the artists, a progress bar that moves
// on by the clock between the player's answers (format.ts progressAt) and
// seeks where a finger lifts, previous, play and pause, next, shuffle,
// repeat (off, the context, the track), the heart, the volume when the
// device takes one, the device (Devices) and the queue, and "Next up": the
// queue's first few, as many as fit. On a wide window the cover stands at
// the left of the rest; on a 320 x 240 tile it is smaller, beside the title,
// with the controls under both. A plays and pauses, left and right go to the
// previous and next track, up and down set the volume.
//
// The mini player is the 40 px bar along the bottom of every other page while
// something plays anywhere: the cover, the title and artists, play and
// pause, next; a tap on it opens Now Playing. While nothing plays and the
// account has no Premium, the same bar says that playing needs it.

import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js";
import { jump } from "@pocketjs/framework/animation";
import { Image, Text, View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { NAV_H } from "../ui/bar.tsx";
import type { PageSpec } from "../ui/nav.tsx";
import { appletSurfaceId, SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { FONT, wrap } from "../ui/text.ts";
import type { Target } from "../ui/touch.ts";
import { coverSide } from "./api.ts";
import { clock } from "./format.ts";
import { ICON } from "./icons.ts";
import { BigToggle, Cover, IconButton, Lines, Message, messageButtonY, Pill, type Env } from "./parts.tsx";
import { fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

/** The mini player's height, its margin included. */
export function miniHeight(): number {
  return 40;
}

/** A row of "Next up" under the controls. */
const NEXT_ROW = 32;
const NEXT_COVER = 26;

interface Geometry {
  cover: number;
  coverX: number;
  coverY: number;
  textX: number;
  textW: number;
  contextY: number;
  titleY: number;
  /** The title's lines; the artists line follows them. */
  titleLines: number;
  /** The title's face: an h2 beside a wide window's cover, an h1 otherwise. */
  titleSlot: number;
  barX: number;
  barW: number;
  barY: number;
  controlsY: number;
  /** The centre of each of the five transport controls. */
  controlX: number[];
  toggle: number;
  /** The smaller transport buttons' side. */
  button: number;
  /** The device's row: its icon at `deviceX`, its name to `nameW`; the queue at `queueX`. */
  deviceY: number;
  deviceX: number;
  queueX: number;
  /** The volume, on the device's row. */
  volumeY: number;
  quieterX: number;
  volumeBarX: number;
  volumeBarW: number;
  louderX: number;
  /** "Next up": its heading's top, its rows' left edge and width, and how many fit. */
  nextY: number;
  nextX: number;
  nextW: number;
  nextRows: number;
}

/** Now Playing laid out for the surface. */
function geometry(): Geometry {
  const W = SCREEN_W, H = SCREEN_H;
  const wide = W >= 440 && H - NAV_H >= 250;
  /** The device's row from `x` to `right`: the device, the volume, the queue at its end. */
  const row = (x: number, right: number, y: number) => {
    const queueX = right - 30;
    const louderX = queueX - 32;
    const volumeBarW = 40;
    const volumeBarX = louderX - 4 - volumeBarW;
    return { deviceY: y, deviceX: x - 6, queueX, volumeY: y, louderX, volumeBarX, volumeBarW, quieterX: volumeBarX - 32 };
  };
  const next = (y: number, x: number, w: number) => ({ nextY: y, nextX: x, nextW: w, nextRows: Math.max(0, Math.min(4, Math.floor((H - y - 18 - 4) / NEXT_ROW))) });
  if (wide) {
    // the cover at the left; the title, the controls and what comes next beside it
    const top = NAV_H + 10;
    const cover = Math.min(Math.round(W * 0.36), H - NAV_H - 20, 220);
    const coverX = 16;
    const textX = coverX + cover + 18;
    const textW = W - textX - 16;
    const barY = top + 64;
    const step = textW / 5;
    const deviceY = barY + 72;
    return {
      cover, coverX, coverY: top, textX, textW, contextY: top, titleY: top + 15, titleLines: 1, titleSlot: F.h2,
      barX: textX, barW: textW, barY,
      controlsY: barY + 24, controlX: [0, 1, 2, 3, 4].map((i) => Math.round(textX + step * (i + 0.5))), toggle: 44, button: 36,
      ...row(textX, textX + textW, deviceY),
      ...next(deviceY + 36, textX, textW),
    };
  }
  const cover = H - NAV_H >= 300 ? 120 : 80;
  const coverX = S.pad;
  const coverY = NAV_H + 8;
  const textX = coverX + cover + 14;
  const textW = W - textX - S.pad;
  const barY = coverY + cover + 14;
  const step = (W - S.pad * 2) / 5;
  const rowY = barY + 20 + 46;
  return {
    cover, coverX, coverY, textX, textW, contextY: coverY + 2, titleY: coverY + 20, titleLines: 2, titleSlot: F.h1,
    barX: S.pad + 4, barW: W - S.pad * 2 - 8, barY,
    controlsY: barY + 20, controlX: [0, 1, 2, 3, 4].map((i) => Math.round(S.pad + step * (i + 0.5))), toggle: 44, button: 40,
    ...row(S.pad + 4, W - S.pad, rowY),
    ...next(rowY + 36, S.pad, W - S.pad * 2),
  };
}

export function playerPage(env: Env): PageSpec {
  const { model } = env;
  const g = geometry();
  const W = SCREEN_W;
  const player = model.player;
  const item = () => player()?.item ?? null;
  const active = () => !!player()?.active && !!item();
  const duration = () => item()?.durationMs ?? 0;
  const lit = (id: string) => env.press.is(id);
  // the position, read a few times a second: the bar's fill and the times
  const [now, setNow] = createSignal(model.position());
  const [preview, setPreview] = createSignal(-1);
  const [volumeShown, setVolumeShown] = createSignal(0);
  let frames = 0;
  onFrame(() => {
    if (++frames % 6 === 0) setNow(model.position());
    if (volumeShown() > 0) setVolumeShown(volumeShown() - 1);
  });
  model.setPlayerShown(true);
  onCleanup(() => model.setPlayerShown(false));

  const shownMs = () => (preview() >= 0 ? preview() : now());
  const fraction = () => (duration() > 0 ? Math.max(0, Math.min(1, shownMs() / duration())) : 0);
  const volume = () => player()?.device?.volume ?? null;
  /** The device's name ends before the volume when they share a row. */
  const nameW = () => (volume() !== null ? g.quieterX : g.queueX) - (g.deviceX + 34) - 6;
  const texts = createMemo(() => {
    env.faces.revision();
    const value = item();
    const context = player()?.context;
    return {
      context: fit(env.faces, context?.title ? `Playing from ${context.title}` : "", F.small, g.textW, 1),
      title: fit(env.faces, value?.title ?? "", g.titleSlot, g.textW - 34, g.titleLines),
      artists: fit(env.faces, value?.artists?.map((artist) => artist.name).join(", ") || value?.subtitle || "", F.body, g.textW, 1),
      device: fit(env.faces, player()?.device?.name ?? "", F.small, Math.max(40, nameW()), 1),
    };
  });
  /** A title from the glyph atlas is the atlas face's size, not the h1's. */
  const titleLeading = () => (texts().title.slot >= F.rich ? 19 : g.titleSlot === F.h2 ? 22 : 24);
  const artistsY = () => g.titleY + texts().title.lines.length * titleLeading() + 2;
  // What comes next: the first few of the queue, asked for again as the track changes.
  const queue = model.answers.query("queue", () => env.client.queue());
  let queued = "";
  createEffect(() => {
    const uri = item()?.uri ?? "";
    if (uri && uri !== queued) {
      if (queued) queue.reload();
      queued = uri;
    }
  });
  const nextUp = createMemo(() => {
    env.faces.revision();
    return (queue.data()?.next ?? []).slice(0, g.nextRows).map((entry) => ({
      entry,
      title: fit(env.faces, entry.title, F.smallBold, g.nextW - NEXT_COVER - 10, 1),
      artists: fit(env.faces, entry.artists?.map((artist) => artist.name).join(", ") || entry.subtitle, F.small, g.nextW - NEXT_COVER - 10, 1),
    }));
  });
  const nextH = () => (nextUp().length ? 18 + nextUp().length * NEXT_ROW : 0);
  const liked = () => {
    const uri = item()?.uri ?? "";
    return model.liked(uri) ?? player()?.liked ?? false;
  };
  const nudge = (by: number) => {
    if (volume() === null) return;
    model.nudgeVolume(by);
    setVolumeShown(90);
  };

  // The bar seeks: down shows where, a slide moves it, the release seeks once.
  const barFraction = (x: number) => Math.max(0, Math.min(1, (x - g.barX) / g.barW));
  let scrubbing = false;
  createGesture({
    surface: appletSurfaceId(),
    region: { rect: () => (env.stack.top()?.page === "player" && !env.stack.busy() && active() ? { x: g.barX - 10, y: g.barY - 14, w: g.barW + 20, h: 30 } : null) },
    onDown(contact) {
      scrubbing = duration() > 0;
      if (scrubbing) setPreview(barFraction(contact.x) * duration());
    },
    onMove(contact) {
      if (scrubbing) setPreview(barFraction(contact.x) * duration());
    },
    onUp() {
      if (!scrubbing) return;
      scrubbing = false;
      const to = preview();
      setPreview(-1);
      if (to >= 0) {
        model.seek(to);
        setNow(to);
      }
    },
    onCancel() {
      scrubbing = false;
      setPreview(-1);
    },
  });

  const control = (index: number, id: string, run: () => void, size: number): Target => ({ id, x: g.controlX[index]! - size / 2, y: g.controlsY + (g.toggle - size) / 2, w: size, h: size, run });
  const repeat = () => player()?.repeat ?? "off";
  const bottom = (): Target[] => [
    { id: "player.devices", x: g.deviceX, y: g.deviceY, w: 34 + nameW(), h: 28, run: () => env.stack.push("devices") },
    { id: "player.queue", x: g.queueX, y: g.deviceY, w: 30, h: 28, run: () => env.stack.push("queue") },
    ...(volume() !== null
      ? [
          { id: "player.quieter", x: g.quieterX, y: g.volumeY, w: 30, h: 28, run: () => nudge(-10) },
          { id: "player.louder", x: g.louderX, y: g.volumeY, w: 30, h: 28, run: () => nudge(10) },
        ]
      : []),
    ...(nextH() ? [{ id: "player.next-up", x: g.nextX, y: g.nextY, w: g.nextW, h: nextH(), run: () => env.stack.push("queue") }] : []),
  ];
  const transport = (): Target[] => [
    control(0, "player.shuffle", () => model.toggleShuffle(), g.button),
    control(1, "player.previous", () => model.previous(), g.button),
    control(2, "player.toggle", () => model.toggle(), g.toggle),
    control(3, "player.next", () => model.next(), g.button),
    control(4, "player.repeat", () => model.cycleRepeat(), g.button),
  ];
  const likeTarget = (): Target => ({ id: "player.like", x: g.textX + g.textW - 32, y: g.titleY - 4, w: 34, h: 32, run: () => item() && model.toggleLike(item()!.uri) });

  const emptyY = NAV_H + 30;
  /** Why playing here cannot start: no Premium, or the speaker not ready. */
  const hint = () => model.premiumNote() || model.speakerNote();
  const hintLines = () => (hint() ? wrap(hint(), FONT.xs, Math.min(300, W - 32), 3) : []);
  const playHereY = () => messageButtonY(emptyY, "Start something on any device, or play here.", W);
  /** This device plays and its speaker cannot: said where "Next up" goes, when there is room. */
  const localNote = () => (active() && player()?.device?.local && g.nextRows >= 2 && !model.premiumNote() ? model.speakerNote() : "");
  const localLines = () => (localNote() ? wrap(localNote(), FONT.xs, g.nextW - 20, 3) : []);
  const localSetupY = () => g.nextY + 10 + localLines().length * 15 + 8;

  const filled = () => Math.round(g.barW * fraction());

  return {
    title: () => "Now Playing",
    backLabel: "Playing",
    tint: "flat",
    barColors: BAR,
    activateLabel: () => "",
    fixed: () => (
      <>
        <Show when={active()}>
          <Cover covers={env.covers} url={() => item()?.image ?? ""} x={g.coverX} y={g.coverY} size={g.cover} side={coverSide(g.cover)} />
          <Lines fitted={texts().context} x={g.textX} y={g.contextY} w={g.textW} leading={16} color={C.muted} />
          <Lines fitted={texts().title} x={g.textX} y={g.titleY} w={g.textW - 34} leading={titleLeading()} color={C.text} />
          <Lines fitted={texts().artists} x={g.textX} y={artistsY()} w={g.textW} leading={18} color={C.muted} />
          <IconButton x={likeTarget().x} y={likeTarget().y} w={34} h={32} size={20} icon={() => (liked() ? ICON["heart-fill"].green20 : ICON.heart.white20)} lit={() => lit("player.like")} />
          {/* the progress bar and its times */}
          <View class="absolute" style={{ insetL: g.barX, insetT: g.barY, width: g.barW, height: 4, radius: 2, bgColor: C.track }} />
          <View class="absolute" style={{ insetL: g.barX, insetT: g.barY, width: filled(), height: 4, radius: 2, bgColor: preview() >= 0 ? C.accent : C.text }} />
          <View class="absolute" style={{ insetL: g.barX + filled() - 6, insetT: g.barY - 4, width: 12, height: 12, radius: 6, bgColor: C.text }} />
          <Text class="absolute text-xs" style={{ insetL: g.barX, insetT: g.barY + 7, width: 80, textColor: C.muted }}>{clock(shownMs())}</Text>
          <Text class="absolute text-xs text-right" style={{ insetL: g.barX + g.barW - 80, insetT: g.barY + 7, width: 80, textColor: C.muted }}>{clock(duration())}</Text>
          {/* the transport */}
          <IconButton x={transport()[0]!.x} y={transport()[0]!.y} w={g.button} h={g.button} size={20} icon={() => (player()?.shuffle ? ICON.shuffle.green20 : ICON.shuffle.white20)} lit={() => lit("player.shuffle")} />
          <IconButton x={transport()[1]!.x} y={transport()[1]!.y} w={g.button} h={g.button} size={24} icon={() => ICON.previous.white24} lit={() => lit("player.previous")} />
          <BigToggle x={g.controlX[2]! - g.toggle / 2} y={g.controlsY} size={g.toggle} playing={() => !!player()?.playing} lit={() => lit("player.toggle")} />
          <IconButton x={transport()[3]!.x} y={transport()[3]!.y} w={g.button} h={g.button} size={24} icon={() => ICON.next.white24} lit={() => lit("player.next")} />
          <IconButton x={transport()[4]!.x} y={transport()[4]!.y} w={g.button} h={g.button} size={20} icon={() => (repeat() === "off" ? ICON.repeat.white20 : ICON.repeat.green20)} lit={() => lit("player.repeat")} />
          <Show when={repeat() === "track"}>
            <View class="absolute" style={{ insetL: g.controlX[4]! + 4, insetT: g.controlsY + (g.toggle - g.button) / 2 + 3, width: 14, height: 14, radius: 7, bgColor: C.accent }} />
            <Text class="absolute text-xs font-bold text-center" style={{ insetL: g.controlX[4]! + 4, insetT: g.controlsY + (g.toggle - g.button) / 2 + 2, width: 14, textColor: C.black }}>1</Text>
          </Show>
          {/* the device, the volume and the queue, on one row */}
          <IconButton x={g.deviceX} y={g.deviceY} w={32} h={28} size={20} icon={() => (player()?.device && !player()!.device!.local ? ICON.devices.green20 : ICON.devices.white20)} lit={() => lit("player.devices")} />
          <Lines fitted={texts().device} x={g.deviceX + 34} y={g.deviceY + 6} w={nameW()} leading={16} color={player()?.device?.local ? C.muted : C.accent} />
          <IconButton x={g.queueX} y={g.deviceY} w={30} h={28} size={20} icon={() => ICON.queue.white20} lit={() => lit("player.queue")} />
          <Show when={volume() !== null}>
            <IconButton x={g.quieterX} y={g.volumeY} w={30} h={28} size={16} icon={() => ICON.volume.muted16} lit={() => lit("player.quieter")} />
            <View class="absolute" style={{ insetL: g.volumeBarX, insetT: g.volumeY + 12, width: g.volumeBarW, height: 4, radius: 2, bgColor: C.track }} />
            <View class="absolute" style={{ insetL: g.volumeBarX, insetT: g.volumeY + 12, width: Math.round((g.volumeBarW * (volume() ?? 0)) / 100), height: 4, radius: 2, bgColor: volumeShown() > 0 ? C.accent : C.text }} />
            <IconButton x={g.louderX} y={g.volumeY} w={30} h={28} size={16} icon={() => ICON.volume.white16} lit={() => lit("player.louder")} />
          </Show>
          {/* what comes next: the queue's first few; a tap opens the queue */}
          <Show when={localNote()}>
            <View class="absolute" style={{ insetL: g.nextX, insetT: g.nextY, width: g.nextW, height: localSetupY() - g.nextY + (model.offerSetup() ? 38 : 2), radius: 8, bgColor: C.raised }} />
            <Text class="absolute text-xs leading-[15]" style={{ insetL: g.nextX + 10, insetT: g.nextY + 10, width: g.nextW - 20, textColor: C.text }}>{localLines().join("\n")}</Text>
            <Show when={model.offerSetup()}>
              <Pill x={g.nextX + 10} y={localSetupY()} w={150} h={30} label={model.setupLabel()} primary lit={() => lit("player.setup")} />
            </Show>
          </Show>
          <Show when={nextUp().length && !localNote()}>
            <Show when={lit("player.next-up")}>
              <View class="absolute" style={{ insetL: g.nextX - 4, insetT: g.nextY - 2, width: g.nextW + 8, height: nextH() + 2, radius: 6, bgColor: C.lit }} />
            </Show>
            <Text class="absolute text-xs font-bold" style={{ insetL: g.nextX, insetT: g.nextY, width: g.nextW, textColor: C.muted }}>Next up</Text>
            <For each={nextUp()}>
              {(row, index) => (
                <>
                  <Cover covers={env.covers} url={() => row.entry.image} x={g.nextX} y={g.nextY + 18 + index() * NEXT_ROW + (NEXT_ROW - NEXT_COVER) / 2} size={NEXT_COVER} side={coverSide(NEXT_COVER)} />
                  <Lines fitted={row.title} x={g.nextX + NEXT_COVER + 8} y={g.nextY + 18 + index() * NEXT_ROW + 1} w={g.nextW - NEXT_COVER - 10} leading={15} color={C.text} />
                  <Lines fitted={row.artists} x={g.nextX + NEXT_COVER + 8} y={g.nextY + 18 + index() * NEXT_ROW + 16} w={g.nextW - NEXT_COVER - 10} leading={14} color={C.muted} />
                </>
              )}
            </For>
          </Show>
        </Show>
        <Show when={!active()}>
          <Show
            when={hintLines().length === 0}
            fallback={<Message w={W} top={emptyY} title="Nothing is playing anywhere" detail={hint()} button={!model.premiumNote() && model.offerSetup() ? { id: "player.setup", label: model.setupLabel(), primary: true } : undefined} lit={lit} />}
          >
            <Message w={W} top={emptyY} title="Nothing is playing anywhere" detail="Start something on any device, or play here." button={{ id: "player.here", label: "Play on this device", primary: true }} lit={lit} />
          </Show>
        </Show>
      </>
    ),
    fixedTargets: () =>
      active()
        ? [...transport(), likeTarget(), ...(localNote() ? bottom().filter((target) => target.id !== "player.next-up") : bottom()), ...(localNote() && model.offerSetup() ? [{ id: "player.setup", x: g.nextX + 10, y: localSetupY(), w: 150, h: 30, run: () => model.openSetup() }] : [])]
        : hintLines().length === 0
          ? [{ id: "player.here", x: (W - 150) / 2, y: playHereY(), w: 150, h: 32, run: () => model.playHere() }]
          : !model.premiumNote() && model.offerSetup()
            ? [{ id: "player.setup", x: (W - 150) / 2, y: messageButtonY(emptyY, hint(), W), w: 150, h: 32, run: () => model.openSetup() }]
            : [],
    legend: () => [
      { button: "circle", label: player()?.playing ? "Pause" : "Play" },
      { button: "dpad-h", label: "Track" },
      ...(volume() !== null ? [{ button: "dpad-v" as const, label: "Volume" }] : []),
      { button: "triangle", label: liked() ? "Unlike" : "Like" },
      { button: "square", label: "Devices" },
    ],
    key(pressed) {
      if (pressed & BTN.CIRCLE) model.toggle();
      else if (pressed & BTN.LEFT) model.previous();
      else if (pressed & BTN.RIGHT) model.next();
      else if (pressed & BTN.UP) nudge(10);
      else if (pressed & BTN.DOWN) nudge(-10);
      else if (pressed & BTN.TRIANGLE && item()) model.toggleLike(item()!.uri);
      else if (pressed & BTN.SQUARE) env.stack.push("devices");
      else if (pressed & BTN.START) env.stack.push("queue");
      else return false;
      return true;
    },
  };
}

// ---- the mini player and the Premium note -----------------------------------------

/** What the bar along the bottom shows. */
export function bottomBar(env: Env): Accessor<"mini" | "premium" | "speaker" | null> {
  return () => {
    const { model } = env;
    if (model.phase() !== "ready") return null;
    if (env.stack.top()?.page === "player" || env.stack.top()?.page === "setup") return null;
    const player = model.player();
    const playing = !!player?.active && !!player.item;
    // this device's speaker cannot play (refused, waiting to be picked): said
    // where playing would go to it, over the mini player of a track it plays
    if (model.speakerNote() && (!playing || player?.device?.local)) return "speaker";
    if (playing) return "mini";
    return model.premiumNote() ? "premium" : null;
  };
}

/** The speaker's note in the mini player's place, and Set Up when it is offered. */
export function SpeakerNote(props: { env: Env }) {
  const { model } = props.env;
  const H = miniHeight();
  const W = SCREEN_W;
  const y = SCREEN_H - H + 3;
  const h = H - 6;
  const buttonW = () => (model.offerSetup() ? 72 : 0);
  const lines = () => wrap(model.speakerNote(), FONT.xs, W - 36 - (buttonW() ? buttonW() + 8 : 0), 2);
  return (
    <>
      <View class="absolute" style={{ insetL: 0, insetT: SCREEN_H - H, width: W, height: H, bgColor: C.bg }} />
      <View class="absolute" style={{ insetL: 6, insetT: y, width: W - 12, height: h, radius: 6, bgColor: props.env.press.is("speaker.bar") ? "#3a3a3a" : C.raised }} />
      <Text class="absolute text-xs leading-[14]" style={{ insetL: 16, insetT: y + (h - lines().length * 14) / 2 - 1, width: W - 32 - (buttonW() ? buttonW() + 8 : 0), textColor: C.text }}>{lines().join("\n")}</Text>
      <Show when={buttonW()}>
        <View class="absolute" style={{ insetL: W - 12 - buttonW(), insetT: y + (h - 24) / 2, width: buttonW(), height: 24, radius: 12, bgColor: props.env.press.is("speaker.setup") ? C.accentLit : C.accent }} />
        <Text class="absolute text-xs font-bold text-center" style={{ insetL: W - 12 - buttonW(), insetT: y + (h - 24) / 2 + 4, width: buttonW(), textColor: C.black }}>{model.setupLabel()}</Text>
      </Show>
    </>
  );
}

/** The speaker note's targets: the bar opens the setup, as its button does. */
export function speakerTargets(env: Env): Target[] {
  const H = miniHeight();
  const y = SCREEN_H - H + 3;
  const W = SCREEN_W;
  const status = env.model.status()?.speaker.state;
  const opens = status === "refused" || status === "pair" || status === "conflict";
  return [
    { id: "speaker.bar", x: 6, y, w: W - 12, h: H - 6, ...(opens ? { run: () => env.model.openSetup() } : {}) },
    ...(env.model.offerSetup() ? [{ id: "speaker.setup", x: W - 12 - 72, y, w: 72, h: H - 6, run: () => env.model.openSetup() }] : []),
  ];
}

export function miniTargets(env: Env): Target[] {
  const H = miniHeight();
  const y = SCREEN_H - H + 3;
  const W = SCREEN_W;
  return [
    { id: "mini.open", x: 6, y, w: W - 12, h: H - 6, run: () => env.stack.push("player") },
    { id: "mini.toggle", x: W - 88, y, w: 38, h: H - 6, run: () => env.model.toggle() },
    { id: "mini.next", x: W - 48, y, w: 38, h: H - 6, run: () => env.model.next() },
  ];
}

export function MiniPlayer(props: { env: Env }) {
  const { env } = props;
  const { model } = env;
  const H = miniHeight();
  const W = SCREEN_W;
  const y = SCREEN_H - H + 3;
  const h = H - 6;
  const item = () => model.player()?.item ?? null;
  const art = h - 8;
  const textW = W - (art + 18) - 96;
  const texts = createMemo(() => {
    env.faces.revision();
    const value = item();
    return {
      title: fit(env.faces, value?.title ?? "", F.smallBold, textW, 1),
      artists: fit(env.faces, value?.artists?.map((artist) => artist.name).join(", ") || value?.subtitle || "", F.small, textW, 1),
    };
  });
  let fill!: NodeMirror;
  let frames = 0;
  onFrame(() => {
    if (++frames % 15 !== 0 || !fill) return;
    const length = item()?.durationMs ?? 0;
    jump(fill, "width", length > 0 ? Math.round((W - 24) * Math.min(1, model.position() / length)) : 0);
  });
  return (
    <>
      <View class="absolute" style={{ insetL: 0, insetT: SCREEN_H - H, width: W, height: H, bgColor: C.bg }} />
      <View class="absolute" style={{ insetL: 6, insetT: y, width: W - 12, height: h, radius: 6, bgColor: env.press.is("mini.open") ? "#3a3a3a" : "#2f2f2f" }} />
      <Cover covers={env.covers} url={() => item()?.image ?? ""} x={12} y={y + (h - art) / 2 - 1} size={art} side={coverSide(art)} />
      <Lines fitted={texts().title} x={art + 18} y={y + (h - 30) / 2 - 1} w={textW} leading={15} color={C.text} />
      <Lines fitted={texts().artists} x={art + 18} y={y + (h - 30) / 2 + 14} w={textW} leading={15} color={C.muted} />
      <IconButton x={W - 88} y={y} w={38} h={h} size={20} icon={() => (model.player()?.playing ? ICON.pause.white20 : ICON.play.white20)} lit={() => env.press.is("mini.toggle")} />
      <IconButton x={W - 48} y={y} w={38} h={h} size={20} icon={() => ICON.next.white20} lit={() => env.press.is("mini.next")} />
      <View class="absolute" style={{ insetL: 12, insetT: y + h - 2, width: W - 24, height: 2, radius: 1, bgColor: "#5a5a5a" }} />
      <View ref={fill} class="absolute" style={{ insetL: 12, insetT: y + h - 2, width: 0, height: 2, radius: 1, bgColor: C.text }} />
    </>
  );
}

/** The Premium note in the mini player's place, while nothing plays. */
export function PremiumNote(props: { env: Env }) {
  const H = miniHeight();
  const W = SCREEN_W;
  const y = SCREEN_H - H + 3;
  const h = H - 6;
  const lines = () => wrap(props.env.model.premiumNote(), FONT.xs, W - 36, 2);
  return (
    <>
      <View class="absolute" style={{ insetL: 0, insetT: SCREEN_H - H, width: W, height: H, bgColor: C.bg }} />
      <View class="absolute" style={{ insetL: 6, insetT: y, width: W - 12, height: h, radius: 6, bgColor: C.surface }} />
      <Text class="absolute text-xs leading-[14]" style={{ insetL: 18, insetT: y + (h - lines().length * 14) / 2 - 1, width: W - 36, textColor: C.text }}>{lines().join("\n")}</Text>
    </>
  );
}
