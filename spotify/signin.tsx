// SPDX-License-Identifier: GPL-3.0-or-later
// pocket-applet: draws its own pixels because the sign-in page shows a QR code.
// spotify/signin.tsx — the pages before Spotify answers for the owner: the
// service starting or not answering, and the sign-in. Sign In starts a
// pairing, as a TV signs in: the service shows a short code, and the owner
// confirms it at spotify.com/pair on a phone (from the QR code, the code
// filled in) or on any computer (typing the code). The status, asked for
// every 2 s, says when it is done; Cancel forgets the pairing.

import { createMemo, createSignal, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { companionNow } from "../lib/net.ts";
import { NAV_H } from "../ui/bar.tsx";
import { Qr } from "../ui/qr.tsx";
import { viewHeight, type LayerContext, type PageSpec } from "../ui/nav.tsx";
import { SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { FONT, wrap } from "../ui/text.ts";
import { minutesLeft, spacedCode } from "./format.ts";
import { listContent } from "./list.tsx";
import { litFor, Message, messageButtonY, messageHeight, Pill, type Env } from "./parts.tsx";
import { BAR, C, S } from "./theme.ts";

/** What the pairing page says to someone without the QR code. */
const ELSEWHERE = "or open spotify.com/pair on any phone or computer and enter the code";

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

/** Sign In, then the pairing: its QR code, its code, the time left and Cancel. */
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
  const wide = W >= 440 && H >= 300;
  const qrSize = wide ? Math.min(H - NAV_H - 40, 220) : Math.min(H - NAV_H - 24, 120);
  const qrX = wide ? 18 : S.pad;
  const colX = qrX + qrSize + (wide ? 24 : 12);
  const colW = W - colX - (wide ? 16 : S.pad);
  const leading = wide ? 20 : 18;
  const codeH = wide ? 44 : 36;
  const cancelW = Math.min(140, colW);
  const errorLines = (width: number) => (model.status()?.error ? wrap(model.status()!.error, FONT.xs, width, 4) : []);
  const pairing = createMemo(() => {
    const scan = wrap("Scan with your phone", wide ? FONT.baseBold : FONT.smBold, colW, 2);
    const elsewhere = wrap(ELSEWHERE, FONT.xs, colW, 5);
    const codeY = scan.length * leading + 8;
    const elsewhereY = codeY + codeH + 8;
    const expiryY = elsewhereY + elsewhere.length * 15 + 4;
    const cancelY = expiryY + 15 + 12;
    const errorY = cancelY + 34 + 10;
    const column = errorY + (wide ? errorLines(colW).length * 16 : 0);
    const top = NAV_H + Math.max(10, Math.round((H - NAV_H - Math.max(qrSize, column)) / 2));
    return { scan, elsewhere, top, codeY: top + codeY, elsewhereY: top + elsewhereY, expiryY: top + expiryY, cancelY: top + cancelY, errorY: top + errorY };
  });
  /** Minutes while under an hour: a pairing lasts up to one. */
  const expiry = () => {
    const value = pending();
    if (!value) return "";
    const left = minutesLeft(value.expiresAt, now());
    if (!left) return "Expired: sign in again";
    return value.expiresAt - now() > 3_660_000 ? "Waiting for you to enter the code" : `Expires in ${left}`;
  };
  const introTop = NAV_H + 20;
  const introW = Math.min(320, W - 48);
  const intro = wrap("Your phone, or any computer, confirms the sign-in with a code.", FONT.xs, introW, 3);
  const buttonY = () => introTop + 34 + intro.length * 16 + 12;
  const noteLines = () => (errorLines(W - 48).length ? errorLines(W - 48) : wrap("Playing needs Spotify Premium.", FONT.xs, W - 48, 2));
  const fixedTargets = () =>
    pending()
      ? [{ id: "signin.cancel", x: colX, y: pairing().cancelY, w: cancelW, h: 34, run: () => model.cancelSignIn() }]
      : [{ id: "signin.start", x: (W - 180) / 2, y: buttonY(), w: 180, h: 38, run: () => model.signIn() }];
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
              <Qr url={() => value().url} x={qrX} y={pairing().top} size={qrSize} />
              <Text class={wide ? "absolute text-base font-bold leading-[20]" : "absolute text-sm font-bold leading-[18]"} style={{ insetL: colX, insetT: pairing().top, width: colW, textColor: C.text }}>{pairing().scan.join("\n")}</Text>
              <View class="absolute" style={{ insetL: colX, insetT: pairing().codeY, width: colW, height: codeH, radius: 8, bgColor: C.raised }} />
              <Text class="absolute text-xl font-bold text-center" style={{ insetL: colX, insetT: pairing().codeY + (codeH - 22) / 2, width: colW, textColor: C.text }}>{spacedCode(value().code)}</Text>
              <Text class="absolute text-xs leading-[15]" style={{ insetL: colX, insetT: pairing().elsewhereY, width: colW, textColor: C.muted }}>{pairing().elsewhere.join("\n")}</Text>
              <Text class="absolute text-xs" style={{ insetL: colX, insetT: pairing().expiryY, width: colW, textColor: C.muted }}>{expiry()}</Text>
              <Pill x={colX} y={pairing().cancelY} w={cancelW} h={34} label="Cancel" lit={() => lit("signin.cancel")} />
              <Show
                when={wide}
                fallback={<Text class="absolute text-xs leading-[16]" style={{ insetL: qrX, insetT: pairing().top + qrSize + 8, width: qrSize, textColor: C.red }}>{errorLines(qrSize).join("\n")}</Text>}
              >
                <Text class="absolute text-xs leading-[16]" style={{ insetL: colX, insetT: pairing().errorY, width: colW, textColor: C.red }}>{errorLines(colW).join("\n")}</Text>
              </Show>
            </>
          )}
        </Show>
        <Show when={!pending()}>
          <Text class="absolute text-xl font-bold text-center" style={{ insetL: 0, insetT: introTop, width: W, textColor: C.text }}>Sign in to Spotify</Text>
          <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: (W - introW) / 2, insetT: introTop + 34, width: introW, textColor: C.muted }}>{intro.join("\n")}</Text>
          <Pill x={(W - 180) / 2} y={buttonY()} w={180} h={38} label={model.starting() ? "Starting" : "Sign In"} primary lit={() => lit("signin.start")} />
          <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: 24, insetT: buttonY() + 50, width: W - 48, textColor: model.status()?.error ? C.red : C.muted }}>{noteLines().join("\n")}</Text>
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
