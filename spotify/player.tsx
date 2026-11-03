// SPDX-License-Identifier: GPL-3.0-or-later
// pocket-applet: draws its own pixels because the player is cover art, a seek bar that follows a finger and transport controls.
// spotify/player.tsx — Now Playing and the mini player.
//
// Now Playing: the cover, the title, the artists, a progress bar that moves
// on by the clock between the player's answers (format.ts progressAt) and
// seeks where a finger lifts, previous, play and pause, next, shuffle,
// repeat (off, the context, the track), the heart, the volume when the
// device takes one, the device (Devices) and the queue. On a wide window the
// cover stands at the left of the rest; on a 320 x 240 tile it is smaller,
// beside the title, with the controls under both. A plays and pauses, left
// and right go to the previous and next track, up and down set the volume.
//
// The mini player is the bar along the bottom of every other page while
// something plays anywhere: the cover, the title and artists, play and
// pause, next; a tap on it opens Now Playing. While nothing plays and this
// device's speaker waits for Spotify, the same bar says how to connect it.

import { createMemo, createSignal, onCleanup, Show, type Accessor } from "solid-js";
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
import { BigToggle, Cover, IconButton, Lines, Message, messageButtonY, type Env } from "./parts.tsx";
import { fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

/** The mini player's height, its margin included. */
export function miniHeight(): number {
  return SCREEN_W >= 440 && SCREEN_H >= 300 ? 58 : 46;
}

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
  barX: number;
  barW: number;
  barY: number;
  controlsY: number;
  /** The centre of each of the five transport controls. */
  controlX: number[];
  toggle: number;
  /** The device's row: its icon at `deviceX`, its name to `nameW`; the queue at `queueX`. */
  deviceY: number;
  deviceX: number;
  queueX: number;
  /** The volume: on a row of its own on a wide window, beside the device on a small one. */
  volumeY: number;
  quieterX: number;
  volumeBarX: number;
  volumeBarW: number;
  louderX: number;
}

/** Now Playing laid out for the surface. */
function geometry(): Geometry {
  const W = SCREEN_W, H = SCREEN_H;
  const wide = W >= 440 && H - NAV_H >= 250;
  if (wide) {
    const cover = Math.min(256, Math.round(W * 0.42), H - NAV_H - 40);
    const coverX = 18;
    const textX = coverX + cover + 22;
    const textW = W - textX - 18;
    const column = 120 + 174;
    const top = NAV_H + Math.max(10, Math.round((H - NAV_H - Math.max(cover, column)) / 2));
    const barY = top + 120;
    const step = textW / 5;
    return {
      cover, coverX, coverY: top, textX, textW, contextY: top, titleY: top + 20, titleLines: 2,
      barX: textX, barW: textW, barY,
      controlsY: barY + 36, controlX: [0, 1, 2, 3, 4].map((i) => Math.round(textX + step * (i + 0.5))), toggle: 56,
      deviceY: barY + 104, deviceX: textX - 6, queueX: textX + textW - 34,
      volumeY: barY + 142, quieterX: textX - 6, volumeBarX: textX + 34, volumeBarW: textW - 68, louderX: textX + textW - 30,
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
  const queueX = W - S.pad - 34;
  const louderX = queueX - 36;
  return {
    cover, coverX, coverY, textX, textW, contextY: coverY + 2, titleY: coverY + 20, titleLines: 2,
    barX: S.pad + 4, barW: W - S.pad * 2 - 8, barY,
    controlsY: barY + 20, controlX: [0, 1, 2, 3, 4].map((i) => Math.round(S.pad + step * (i + 0.5))), toggle: 44,
    deviceY: rowY, deviceX: S.pad - 2, queueX,
    volumeY: rowY, quieterX: louderX - 76, volumeBarX: louderX - 42, volumeBarW: 40, louderX,
  };
}

/** What a test or the agent reads about the player. */
export interface PlayerProbe {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  uri: string;
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
    (globalThis as { __pocketSpotify?: PlayerProbe }).__pocketSpotify = { playing: !!player()?.playing, positionMs: model.position(), durationMs: duration(), uri: item()?.uri ?? "" };
  });
  model.setPlayerShown(true);
  onCleanup(() => model.setPlayerShown(false));

  const shownMs = () => (preview() >= 0 ? preview() : now());
  const fraction = () => (duration() > 0 ? Math.max(0, Math.min(1, shownMs() / duration())) : 0);
  const volume = () => player()?.device?.volume ?? null;
  /** The device's name ends before the volume when they share a row. */
  const nameW = () => (g.volumeY === g.deviceY && volume() !== null ? g.quieterX : g.queueX) - (g.deviceX + 36) - 6;
  const texts = createMemo(() => {
    env.faces.revision();
    const value = item();
    const context = player()?.context;
    return {
      context: fit(env.faces, context?.title ? `Playing from ${context.title}` : "", F.small, g.textW, 1),
      title: fit(env.faces, value?.title ?? "", F.h1, g.textW - 34, g.titleLines),
      artists: fit(env.faces, value?.artists?.map((artist) => artist.name).join(", ") || value?.subtitle || "", F.body, g.textW, 1),
      device: fit(env.faces, player()?.device?.name ?? "", F.small, Math.max(40, nameW()), 1),
    };
  });
  /** A title from the glyph atlas is the atlas face's size, not the h1's. */
  const titleLeading = () => (texts().title.slot >= F.rich ? 19 : 24);
  const artistsY = () => g.titleY + texts().title.lines.length * titleLeading() + 4;
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
    { id: "player.devices", x: g.deviceX, y: g.deviceY, w: 36 + nameW(), h: 32, run: () => env.stack.push("devices") },
    { id: "player.queue", x: g.queueX, y: g.deviceY, w: 36, h: 32, run: () => env.stack.push("queue") },
    ...(volume() !== null
      ? [
          { id: "player.quieter", x: g.quieterX, y: g.volumeY, w: 34, h: 32, run: () => nudge(-10) },
          { id: "player.louder", x: g.louderX, y: g.volumeY, w: 34, h: 32, run: () => nudge(10) },
        ]
      : []),
  ];
  const transport = (): Target[] => [
    control(0, "player.shuffle", () => model.toggleShuffle(), 40),
    control(1, "player.previous", () => model.previous(), 44),
    control(2, "player.toggle", () => model.toggle(), g.toggle),
    control(3, "player.next", () => model.next(), 44),
    control(4, "player.repeat", () => model.cycleRepeat(), 40),
  ];
  const likeTarget = (): Target => ({ id: "player.like", x: g.textX + g.textW - 32, y: g.titleY - 4, w: 34, h: 32, run: () => item() && model.toggleLike(item()!.uri) });

  const emptyY = NAV_H + 30;
  const hint = () => model.speakerHint();
  const hintLines = () => (hint() ? wrap(hint(), FONT.xs, Math.min(300, W - 32), 3) : []);
  const playHereY = () => messageButtonY(emptyY, "Start something on any device, or play here.", W);

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
          <Text class="absolute text-xs" style={{ insetL: g.barX, insetT: g.barY + 9, width: 80, textColor: C.muted }}>{clock(shownMs())}</Text>
          <Text class="absolute text-xs text-right" style={{ insetL: g.barX + g.barW - 80, insetT: g.barY + 9, width: 80, textColor: C.muted }}>{clock(duration())}</Text>
          {/* the transport */}
          <IconButton x={transport()[0]!.x} y={transport()[0]!.y} w={40} h={40} size={20} icon={() => (player()?.shuffle ? ICON.shuffle.green20 : ICON.shuffle.white20)} lit={() => lit("player.shuffle")} />
          <IconButton x={transport()[1]!.x} y={transport()[1]!.y} w={44} h={44} size={24} icon={() => ICON.previous.white24} lit={() => lit("player.previous")} />
          <BigToggle x={g.controlX[2]! - g.toggle / 2} y={g.controlsY} size={g.toggle} playing={() => !!player()?.playing} lit={() => lit("player.toggle")} />
          <IconButton x={transport()[3]!.x} y={transport()[3]!.y} w={44} h={44} size={24} icon={() => ICON.next.white24} lit={() => lit("player.next")} />
          <IconButton x={transport()[4]!.x} y={transport()[4]!.y} w={40} h={40} size={20} icon={() => (repeat() === "off" ? ICON.repeat.white20 : ICON.repeat.green20)} lit={() => lit("player.repeat")} />
          <Show when={repeat() === "track"}>
            <View class="absolute" style={{ insetL: g.controlX[4]! + 5, insetT: g.controlsY + (g.toggle - 40) / 2 + 6, width: 12, height: 12, radius: 6, bgColor: C.accent }} />
            <Text class="absolute text-2xs font-bold text-center" style={{ insetL: g.controlX[4]! + 5, insetT: g.controlsY + (g.toggle - 40) / 2 + 6, width: 12, textColor: C.black }}>1</Text>
          </Show>
          {/* the device, the queue and the volume */}
          <IconButton x={g.deviceX} y={g.deviceY} w={34} h={32} size={20} icon={() => (player()?.device && !player()!.device!.local ? ICON.devices.green20 : ICON.devices.white20)} lit={() => lit("player.devices")} />
          <Lines fitted={texts().device} x={g.deviceX + 36} y={g.deviceY + 8} w={nameW()} leading={16} color={player()?.device?.local ? C.muted : C.accent} />
          <IconButton x={g.queueX} y={g.deviceY} w={36} h={32} size={20} icon={() => ICON.queue.white20} lit={() => lit("player.queue")} />
          <Show when={volume() !== null}>
            <IconButton x={g.quieterX} y={g.volumeY} w={34} h={32} size={16} icon={() => ICON.volume.muted16} lit={() => lit("player.quieter")} />
            <View class="absolute" style={{ insetL: g.volumeBarX, insetT: g.volumeY + 14, width: g.volumeBarW, height: 4, radius: 2, bgColor: C.track }} />
            <View class="absolute" style={{ insetL: g.volumeBarX, insetT: g.volumeY + 14, width: Math.round((g.volumeBarW * (volume() ?? 0)) / 100), height: 4, radius: 2, bgColor: volumeShown() > 0 ? C.accent : C.text }} />
            <IconButton x={g.louderX} y={g.volumeY} w={34} h={32} size={16} icon={() => ICON.volume.white16} lit={() => lit("player.louder")} />
          </Show>
        </Show>
        <Show when={!active()}>
          <Show
            when={hintLines().length === 0}
            fallback={<Message w={W} top={emptyY} title="Nothing is playing anywhere" detail={hint()} />}
          >
            <Message w={W} top={emptyY} title="Nothing is playing anywhere" detail="Start something on any device, or play here." button={{ id: "player.here", label: "Play on this device", primary: true }} lit={lit} />
          </Show>
        </Show>
      </>
    ),
    fixedTargets: () =>
      active()
        ? [...transport(), likeTarget(), ...bottom()]
        : hintLines().length === 0
          ? [{ id: "player.here", x: (W - 150) / 2, y: playHereY(), w: 150, h: 32, run: () => model.playHere() }]
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

// ---- the mini player and the speaker's hint --------------------------------------

/** What the bar along the bottom shows. */
export function bottomBar(env: Env): Accessor<"mini" | "hint" | null> {
  return () => {
    const { model } = env;
    if (model.phase() !== "ready") return null;
    if (env.stack.top()?.page === "player") return null;
    if (model.player()?.active && model.player()?.item) return "mini";
    return model.speakerHint() ? "hint" : null;
  };
}

export function miniTargets(env: Env): Target[] {
  const H = miniHeight();
  const y = SCREEN_H - H + 4;
  const W = SCREEN_W;
  return [
    { id: "mini.open", x: 6, y, w: W - 12, h: H - 8, run: () => env.stack.push("player") },
    { id: "mini.toggle", x: W - 92, y, w: 40, h: H - 8, run: () => env.model.toggle() },
    { id: "mini.next", x: W - 50, y, w: 40, h: H - 8, run: () => env.model.next() },
  ];
}

export function MiniPlayer(props: { env: Env }) {
  const { env } = props;
  const { model } = env;
  const H = miniHeight();
  const W = SCREEN_W;
  const y = SCREEN_H - H + 4;
  const h = H - 8;
  const item = () => model.player()?.item ?? null;
  const art = h >= 44 ? 34 : 30;
  const textW = W - 52 - 100;
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
      <Lines fitted={texts().title} x={art + 20} y={y + (h - 33) / 2 - 1} w={textW} leading={16} color={C.text} />
      <Lines fitted={texts().artists} x={art + 20} y={y + (h - 33) / 2 + 15} w={textW} leading={16} color={C.muted} />
      <IconButton x={W - 92} y={y + (h - 36) / 2} w={40} h={36} size={20} icon={() => (model.player()?.playing ? ICON.pause.white20 : ICON.play.white20)} lit={() => env.press.is("mini.toggle")} />
      <IconButton x={W - 50} y={y + (h - 36) / 2} w={40} h={36} size={20} icon={() => ICON.next.white20} lit={() => env.press.is("mini.next")} />
      <View class="absolute" style={{ insetL: 12, insetT: y + h - 3, width: W - 24, height: 2, radius: 1, bgColor: "#5a5a5a" }} />
      <View ref={fill} class="absolute" style={{ insetL: 12, insetT: y + h - 3, width: 0, height: 2, radius: 1, bgColor: C.text }} />
    </>
  );
}

/** The speaker's hint in the mini player's place. */
export function SpeakerHint(props: { env: Env }) {
  const H = miniHeight();
  const W = SCREEN_W;
  const y = SCREEN_H - H + 4;
  const h = H - 8;
  // two lines of the small face when they hold it, else of the smaller one
  const fits = () => wrap(props.env.model.speakerHint(), FONT.xs, W - 60, 3).length <= 2;
  const lines = () => wrap(props.env.model.speakerHint(), fits() ? FONT.xs : FONT.xxs, W - 60, 2);
  return (
    <>
      <View class="absolute" style={{ insetL: 0, insetT: SCREEN_H - H, width: W, height: H, bgColor: C.bg }} />
      <View class="absolute" style={{ insetL: 6, insetT: y, width: W - 12, height: h, radius: 6, bgColor: C.surface }} />
      <Image class="absolute w-[20] h-[20]" src={ICON.console.green20} style={{ insetL: 16, insetT: y + (h - 20) / 2 }} />
      <Show
        when={fits()}
        fallback={<Text class="absolute text-2xs leading-[13]" style={{ insetL: 46, insetT: y + (h - lines().length * 13) / 2 - 1, width: W - 60, textColor: C.text }}>{lines().join("\n")}</Text>}
      >
        <Text class="absolute text-xs leading-[15]" style={{ insetL: 46, insetT: y + (h - lines().length * 15) / 2 - 1, width: W - 60, textColor: C.text }}>{lines().join("\n")}</Text>
      </Show>
    </>
  );
}
