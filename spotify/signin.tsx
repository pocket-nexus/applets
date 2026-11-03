// SPDX-License-Identifier: GPL-3.0-or-later
// pocket-applet: draws its own pixels because the sign-in page shows a QR code.
// spotify/signin.tsx — the pages before Spotify answers for the owner: the
// service starting or not answering, the setup (the owner's own Spotify app
// and its Client ID, typed with the deck's keyboard), and the sign-in, whose
// URL the owner's phone opens from a QR code. The service polls Spotify for
// the grant; the status, asked for every 2 s, says when it is done.

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { getOps } from "@pocketjs/framework/host";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { encodeQr } from "../kit/qr.ts";
import { companionNow } from "../lib/net.ts";
import { NAV_H } from "../ui/bar.tsx";
import { viewHeight, type LayerContext, type PageSpec } from "../ui/nav.tsx";
import { SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { FONT, wrap } from "../ui/text.ts";
import { expiresIn } from "./format.ts";
import { listContent } from "./list.tsx";
import { litFor, Lines, Message, messageButtonY, messageHeight, Pill, type Control, type Env } from "./parts.tsx";
import { fit } from "./text.ts";
import { BAR, C, F, S } from "./theme.ts";

/** The Client ID being typed, its failure and whether it is being saved. */
export interface ClientIdField {
  value: Accessor<string>;
  error: Accessor<string>;
  saving: Accessor<boolean>;
  save(): void;
}

// shown, not fetched
const DASHBOARD_URL = "https://developer.spotify.com/dashboard";
// shown, not fetched
const REDIRECT_URI = "https://applets.pocket.nexus/oauth/spotify";

/** A QR code as one texture: a module a texel (or two), white around it,
 *  drawn with nearest sampling. Null when the text does not fit a code. */
function qrTexture(text: string): number {
  let code;
  try {
    code = encodeQr(Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff));
  } catch {
    return -1;
  }
  const quiet = 2;
  const span = code.size + quiet * 2;
  const side = span * 2 <= 128 ? 128 : 256;
  const scale = Math.max(1, Math.floor(side / span));
  const at = Math.floor((side - span * scale) / 2) + quiet * scale;
  const entry = new Uint8Array(8 + side * side * 4).fill(255);
  entry[0] = side & 0xff;
  entry[1] = side >> 8;
  entry[2] = side & 0xff;
  entry[3] = side >> 8;
  entry[4] = 3; // PSM_8888
  entry[5] = 0; // nearest sampling
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      if (!code.modules[y]![x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = 8 + ((at + y * scale + dy) * side + at + x * scale) * 4;
        for (let dx = 0; dx < scale; dx++) {
          entry[row + dx * 4] = 0;
          entry[row + dx * 4 + 1] = 0;
          entry[row + dx * 4 + 2] = 0;
        }
      }
    }
  }
  return getOps().uploadImgEntry?.(entry) ?? -1;
}

/** A QR code for `url` at (x, y), `size` px; the URL in words when it does not fit one. */
function Qr(props: { url: Accessor<string>; x: number; y: number; size: number }) {
  let image!: NodeMirror;
  let shown = "";
  let handle = -1;
  const texture = createMemo(() => {
    const url = props.url();
    if (url === shown) return handle;
    if (handle >= 0) getOps().freeTexture?.(handle);
    shown = url;
    handle = url ? qrTexture(url) : -1;
    return handle;
  });
  onMount(() => createEffect(() => getOps().setImage(image.id, texture())));
  onCleanup(() => {
    if (handle >= 0) getOps().freeTexture?.(handle);
  });
  const words = () => (texture() < 0 && props.url() ? wrap(props.url(), FONT.xs, props.size - 16, 12) : []);
  return (
    <>
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: 8, bgColor: C.white }} />
      <Image ref={image} class="absolute" style={{ insetL: props.x + 6, insetT: props.y + 6, width: props.size - 12, height: props.size - 12 }} />
      <For each={words()}>{(line, index) => <Text class="absolute text-xs" style={{ insetL: props.x + 8, insetT: props.y + 8 + index() * 15, width: props.size - 16, textColor: C.black }}>{line}</Text>}</For>
    </>
  );
}

/** The service is starting, or not answering. */
export function loadingPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const lit = litFor(env, layer.focus);
  const offline = env.model.offline;
  const top = () => Math.max(24, Math.round((SCREEN_H - NAV_H - 140) / 2));
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(),
    head: {
      height: () => top() + messageHeight(offline()?.detail, W, true),
      controls: () => (offline() ? [{ id: "status.retry", x: (W - 150) / 2, y: messageButtonY(top(), offline()!.detail, W), w: 150, h: 32, run: () => env.model.refreshStatus() }] : []),
      view: () => (
        <Show when={offline()} fallback={<Message w={W} top={top()} title="Connecting to Spotify" spinner />}>
          {(problem) => <Message w={W} top={top()} title={problem().title} detail={problem().detail} button={{ id: "status.retry", label: "Try Again" }} lit={lit} />}
        </Show>
      ),
    },
    rows: () => [],
  });
  return { title: () => "Spotify", tint: "flat", barColors: BAR, content, activateLabel: () => "Choose" };
}

/** The setup: make a Spotify app, then type its Client ID. `changing` is
 *  the page Account opens to set another. */
export function setupPage(env: Env, layer: LayerContext, field: ClientIdField, changing: boolean): PageSpec {
  const W = SCREEN_W;
  const lit = litFor(env, layer.focus);
  const wide = W >= 440;
  const QR = 132;
  const textW = wide ? W - S.pad * 3 - QR : W - S.pad * 2;
  const numW = 22;
  const steps = [
    "On a phone or a computer, open developer.spotify.com/dashboard and sign in.",
    `Create an app. Its redirect URI is ${REDIRECT_URI}. Tick Web API and Web Playback SDK.`,
    "Open the app's settings and copy its Client ID.",
    "Type the Client ID here, with the keyboard.",
  ];
  const layout = createMemo(() => {
    const intro = wrap(changing ? "Type the Client ID of another Spotify app of yours. This device signs in again with it." : "This device signs in to Spotify with an app of your own. Make one once:", FONT.sm, textW, 4);
    let y = 14 + 26 + intro.length * 18 + 10;
    const placed = (changing ? steps.slice(2) : steps).map((step, index) => {
      const lines = wrap(step, FONT.xs, textW - numW, 5);
      const at = { number: String(changing ? index + 3 : index + 1), lines, y };
      y += lines.length * 16 + 10;
      return at;
    });
    const fieldY = Math.max(y + 2, wide && !changing ? 14 + QR + 30 : 0);
    return { intro, steps: placed, fieldY, saveY: fieldY + 48, noteY: fieldY + 48 + 44 };
  });
  const fieldW = Math.min(W - S.pad * 2, 360);
  const controls = (): Control[] => [
    { id: "setup.field", x: S.pad, y: layout().fieldY, w: fieldW, h: 38, run: () => env.edit("clientId") },
    { id: "setup.save", x: S.pad, y: layout().saveY, w: 120, h: 34, run: field.save },
  ];
  const typed = () => {
    env.faces.revision();
    const draft = env.draft("clientId");
    const value = draft ?? field.value();
    return fit(env.faces, value || "32 letters and digits", F.body, fieldW - 24);
  };
  const noteLines = () => wrap(field.error() || "Playing needs a Spotify Premium account.", FONT.xs, W - S.pad * 2, 3);
  const content = listContent({
    env,
    layer,
    width: W,
    view: viewHeight(),
    head: {
      height: () => layout().noteY + noteLines().length * 16 + 16,
      controls,
      view: () => (
        <>
          <Text class="absolute text-xl font-bold" style={{ insetL: S.pad, insetT: 12, width: textW, textColor: C.text }}>{changing ? "Change Client ID" : "Set up Spotify"}</Text>
          <Text class="absolute text-sm leading-[18]" style={{ insetL: S.pad, insetT: 42, width: textW, textColor: C.muted }}>{layout().intro.join("\n")}</Text>
          <For each={layout().steps}>
            {(step) => (
              <>
                <View class="absolute" style={{ insetL: S.pad, insetT: step.y, width: 16, height: 16, radius: 8, bgColor: C.accent }} />
                <Text class="absolute text-2xs font-bold text-center" style={{ insetL: S.pad, insetT: step.y + 3, width: 16, textColor: C.black }}>{step.number}</Text>
                <Text class="absolute text-xs leading-[16]" style={{ insetL: S.pad + numW, insetT: step.y, width: textW - numW, textColor: C.text }}>{step.lines.join("\n")}</Text>
              </>
            )}
          </For>
          <Show when={wide && !changing}>
            <Qr url={() => DASHBOARD_URL} x={W - S.pad - QR} y={14} size={QR} />
            <Text class="absolute text-2xs text-center" style={{ insetL: W - S.pad - QR, insetT: 14 + QR + 6, width: QR, textColor: C.muted }}>Scan to open the dashboard</Text>
          </Show>
          <View class="absolute border" style={{ insetL: S.pad, insetT: layout().fieldY, width: fieldW, height: 38, radius: 6, bgColor: lit("setup.field") ? "#333333" : C.raised, borderColor: env.draft("clientId") !== null ? C.accent : C.raised }} />
          <Lines fitted={typed()} x={S.pad + 12} y={layout().fieldY + 10} w={fieldW - 24} leading={18} color={env.draft("clientId") !== null || field.value() ? C.text : C.faint} />
          <Pill x={S.pad} y={layout().saveY} w={120} h={34} label={field.saving() ? "Saving" : "Save"} primary lit={() => lit("setup.save")} />
          <Text class="absolute text-xs leading-[16]" style={{ insetL: S.pad, insetT: layout().noteY, width: W - S.pad * 2, textColor: field.error() ? C.red : C.muted }}>{noteLines().join("\n")}</Text>
        </>
      ),
    },
    rows: () => [],
  });
  return {
    title: () => (changing ? "Client ID" : "Spotify"),
    backLabel: "Setup",
    tint: "flat",
    barColors: BAR,
    content,
    activateLabel: () => "Choose",
    legend: () => [{ button: "square", label: "Type" }],
    key(pressed) {
      if (pressed & BTN.SQUARE) env.edit("clientId");
      else if (pressed & BTN.START) field.save();
      else return false;
      return true;
    },
  };
}

/** Sign in: a button, then the sign-in's QR code until the phone allows it. */
export function signInPage(env: Env, layer: LayerContext): PageSpec {
  const W = SCREEN_W;
  const H = SCREEN_H;
  const { model } = env;
  const lit = litFor(env, layer.focus);
  const pending = model.pendingSignIn;
  // the time left, read once a second
  const [now, setNow] = createSignal(companionNow());
  let frames = 0;
  onFrame(() => {
    if (++frames % 30 === 0) setNow(companionNow());
  });
  const wide = W >= 440;
  const qrSize = wide ? Math.min(H - NAV_H - 32, 240) : Math.min(H - NAV_H - 24, 150);
  const qrX = wide ? 18 : S.pad;
  const qrY = NAV_H + Math.max(12, Math.round((H - NAV_H - qrSize) / 2));
  const textX = qrX + qrSize + (wide ? 22 : 12);
  const textW = W - textX - S.pad;
  const errorLines = () => (model.status()?.error ? wrap(model.status()!.error, FONT.xs, pending() ? textW : W - 48, 4) : []);
  const scanLines = () => wrap("Scan with your phone and allow access", wide ? FONT.baseBold : FONT.smBold, textW, 4);
  const scanLeading = wide ? 20 : 18;
  const left = () => {
    const value = pending();
    return value ? expiresIn(value.expiresAt, now()) : "";
  };
  /** The time left while it is under an hour; past an hour the page says it waits. */
  const expiry = () => {
    const value = pending();
    if (!value || !left()) return "Expired: sign in again";
    return value.expiresAt - now() > 3_600_000 ? "Waiting for your phone" : `Expires in ${left()}`;
  };
  const cancelY = () => qrY + 8 + scanLines().length * scanLeading + 26;
  const introTop = NAV_H + 20;
  const intro = wrap("Your phone signs this device in: Sign In shows a QR code that opens Spotify's page for it.", FONT.xs, Math.min(320, W - 48), 4);
  const buttonY = () => introTop + 34 + intro.length * 16 + 12;
  const fixedTargets = () =>
    pending()
      ? [{ id: "signin.cancel", x: textX, y: cancelY(), w: Math.min(140, textW), h: 34, run: () => model.cancelSignIn() }]
      : [
          { id: "signin.start", x: (W - 180) / 2, y: buttonY(), w: 180, h: 38, run: () => model.signIn() },
          { id: "signin.client", x: (W - 180) / 2, y: buttonY() + 48, w: 180, h: 34, run: () => env.stack.push("config") },
        ];
  return {
    title: () => "Spotify",
    backLabel: "Sign In",
    tint: "flat",
    barColors: BAR,
    activateLabel: () => "",
    fixed: () => (
      <>
        <Show when={pending()}>
          {(value) => (
            <>
              <Qr url={() => value().url} x={qrX} y={qrY} size={qrSize} />
              <Text class={wide ? "absolute text-base font-bold leading-[20]" : "absolute text-sm font-bold leading-[18]"} style={{ insetL: textX, insetT: qrY + 8, width: textW, textColor: C.text }}>{scanLines().join("\n")}</Text>
              <Text class="absolute text-xs" style={{ insetL: textX, insetT: qrY + 8 + scanLines().length * scanLeading + 4, width: textW, textColor: C.muted }}>{expiry()}</Text>
              <Pill x={textX} y={cancelY()} w={Math.min(140, textW)} h={34} label="Cancel" lit={() => lit("signin.cancel")} />
              <Text class="absolute text-xs leading-[16]" style={{ insetL: textX, insetT: cancelY() + 46, width: textW, textColor: C.red }}>{errorLines().join("\n")}</Text>
            </>
          )}
        </Show>
        <Show when={!pending()}>
          <Text class="absolute text-xl font-bold text-center" style={{ insetL: 0, insetT: introTop, width: W, textColor: C.text }}>Sign in to Spotify</Text>
          <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: (W - Math.min(320, W - 48)) / 2, insetT: introTop + 34, width: Math.min(320, W - 48), textColor: C.muted }}>{intro.join("\n")}</Text>
          <Pill x={(W - 180) / 2} y={buttonY()} w={180} h={38} label={model.starting() ? "Starting" : "Sign In"} primary lit={() => lit("signin.start")} />
          <Pill x={(W - 180) / 2} y={buttonY() + 48} w={180} h={34} label="Change Client ID" lit={() => lit("signin.client")} />
          <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: 24, insetT: buttonY() + 96, width: W - 48, textColor: model.status()?.error ? C.red : C.muted }}>
            {errorLines().length ? errorLines().join("\n") : "Playing needs a Spotify Premium account."}
          </Text>
        </Show>
      </>
    ),
    fixedTargets,
    legend: () => (pending() ? [{ button: "triangle", label: "Cancel" }] : [{ button: "triangle", label: "Sign In" }]),
    key(pressed) {
      if (!(pressed & BTN.TRIANGLE) && !(pressed & BTN.CIRCLE)) return false;
      if (pending()) model.cancelSignIn();
      else model.signIn();
      return true;
    },
  };
}
