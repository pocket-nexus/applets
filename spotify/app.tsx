// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/app.tsx — Spotify for Omarchy Pocket: the owner's library, search,
// albums, playlists and artists, and the player, over the device's `spotify`
// service (spotify/contract.ts), which holds the sign-in and is this
// device's Spotify Connect speaker.
//
// The root page follows the service's status: the sign-in (a pairing code
// the owner confirms on a phone or a computer) while no one is signed in,
// else Home, Search and Library under one bar (L and R step through them).
// Pages push from there; the bar's back button and B pop them. The mini
// player along the bottom of every page opens Now Playing; START opens it
// from anywhere. The deck's keyboard types into the search field while it
// is open.

import { createEffect, createSignal, Show, untrack } from "solid-js";
import { AppletSurface } from "@pocketjs/framework/applet";
import { Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress, onFrame } from "@pocketjs/framework/lifecycle";
import { createOsk, keyboardElsewhere, Osk, oskHeight } from "@pocketjs/framework/osk";
import { keep } from "../ui/keep.ts";
import { Legend, legendWhileTyping } from "../ui/legend.tsx";
import { createNavStack, viewHeight, type NavStack } from "../ui/nav.tsx";
import { setupPage } from "../ui/setup.tsx";
import { companionService } from "../lib/net.ts";
import { appletSurfaceId, appletTouch, SCREEN_H, SCREEN_W } from "../ui/screen.ts";
import { FONT, measure, wrap } from "../ui/text.ts";
import { createPress, createTouchRouter, type Target, type TouchPage } from "../ui/touch.ts";
import { createSpotifyClient } from "./api.ts";
import type { Item } from "./contract.ts";
import { homePage, rootPage, type Tab } from "./home.tsx";
import { createSpotifyModel } from "./model.ts";
import { accountPage, albumPage, artistPage, devicesPage, libraryPage, likedPage, pageOf, partsOf, playlistPage, queuePage, remember, searchPage } from "./pages.tsx";
import { Pill, type Env } from "./parts.tsx";
import { bottomBar, miniHeight, MiniPlayer, miniTargets, playerPage, PremiumNote, SpeakerNote, speakerTargets } from "./player.tsx";
import { loadingPage, signInPage } from "./signin.tsx";
import { createFaces } from "./text.ts";
import { BAR, C, SETUP } from "./theme.ts";

const ALL_BUTTONS = 0xffff;
const ROOTS: readonly string[] = ["home", "search", "library"];

interface Alert {
  title: string;
  message: string;
  action: string;
  run: () => void;
}

export default function Spotify() {
  const W = SCREEN_W;
  const client = keep("client", () => createSpotifyClient());
  const model = keep("model", () => createSpotifyModel(client));
  const faces = createFaces(client);
  const press = createPress();
  // Without touch the d-pad focus shows from the start.
  const [keys, setKeys] = createSignal(!appletTouch());
  const [alert, setAlert] = createSignal<Alert | null>(null);

  // ---- the keyboard: the search words, a setup field --------------------------
  type Editing = { kind: "search" } | { kind: "setup"; field: string; commit: (text: string) => void };
  const field = keep("typing", () => createSignal<Editing | null>(null));
  const [editing, setEditing] = field;
  const [draft, setDraft] = createSignal("");
  const osk = createOsk({
    value: draft,
    setValue: setDraft,
    // a setup key runs long; the search words are cut to 80
    maxLength: 512,
    onCommit: (text) => {
      const open = editing();
      setEditing(null);
      if (open?.kind === "search") model.setWords(text.trim().slice(0, 80));
      else if (open?.kind === "setup" && text.trim()) open.commit(text.trim());
    },
    onClose: () => setEditing(null),
  });
  legendWhileTyping(osk.isOpen, "Done");
  const setupDraft = (id: string) => {
    const open = editing();
    return osk.isOpen() && open?.kind === "setup" && open.field === id ? osk.display("|") : null;
  };

  const env: Env = {
    model,
    client,
    covers: client.covers,
    faces,
    press,
    keys,
    useKeys: () => setKeys(true),
    stack: null as unknown as NavStack,
    draft: (which) => (osk.isOpen() && editing()?.kind === which ? osk.display("|") : null),
    edit(which) {
      setEditing({ kind: which });
      setDraft(model.words());
      osk.open();
    },
    bottom: () => (bottom() ? miniHeight() : 0),
    inset: miniHeight(),
    confirm: (next) => setAlert(next),
    open(item: Item, context?: string) {
      if (item.kind === "album" || item.kind === "playlist" || item.kind === "artist") {
        const page = pageOf(item.kind, item.id);
        remember(page, item);
        return stack.push(page);
      }
      if (item.kind === "liked") {
        remember("liked", item);
        return stack.push("liked");
      }
      if (context) model.play(context, { uri: item.uri });
      else if (item.album?.uri) model.play(item.album.uri, { uri: item.uri });
      else model.playUris([item.uri]);
    },
  };
  const bottom = bottomBar(env);
  const go = (tab: Tab) => stack.reset(tab);

  const stack = createNavStack({
    restore: "spotify",
    press,
    keys,
    setKeys,
    onExit: () => undefined,
    rootBack: null,
    background: () => <View class="absolute left-0 top-0" style={{ width: SCREEN_W, height: SCREEN_H, bgColor: C.bg }} />,
    page(id, _nav, layer) {
      const [kind] = partsOf(id);
      switch (kind) {
        case "home":
          return rootPage(env, "home", homePage(env, layer), go);
        case "search":
          return rootPage(env, "search", searchPage(env, layer), go);
        case "library":
          return rootPage(env, "library", libraryPage(env, layer), go);
        case "album":
          return albumPage(env, layer, id);
        case "playlist":
          return playlistPage(env, layer, id);
        case "artist":
          return artistPage(env, layer, id);
        case "liked":
          return likedPage(env, layer);
        case "player":
          return playerPage(env);
        case "queue":
          return queuePage(env, layer);
        case "devices":
          return devicesPage(env, layer);
        case "account":
          return accountPage(env, layer);
        case "signin":
          return signInPage(env, layer);
        case "setup":
          // Spotify's own player: the service's owner setup, as every companion service answers it
          return setupPage({
            url: companionService("spotify", "/_setup"),
            layer,
            press,
            keys,
            width: SCREEN_W,
            view: viewHeight(),
            palette: SETUP,
            barColors: BAR,
            edit(entry, commit) {
              setEditing({ kind: "setup", field: entry.id, commit });
              setDraft("");
              osk.open();
            },
            draft: setupDraft,
            onReady: () => model.refreshStatus(),
          });
        default:
          return loadingPage(env, layer);
      }
    },
  });
  env.stack = stack;
  model.setOpenSetup(() => {
    if (stack.top()?.page !== "setup") stack.push("setup");
  });

  // The root page follows the status: a sign-out starts over.
  createEffect(() => {
    const phase = model.phase();
    const root = stack.entries()[0]?.page ?? "";
    const want = phase === "ready" ? (ROOTS.includes(root) ? root : "home") : phase === "signin" ? "signin" : "loading";
    if (root !== want) untrack(() => stack.reset(want));
  });
  if (model.status() === null) model.refreshStatus();
  onFrame(() => {
    model.tick();
    // what a test or the agent reads: the page on top
    (globalThis as { __pocketSpotifyPage?: string }).__pocketSpotifyPage = stack.top()?.page ?? "";
  });

  // ---- touch: the page, the bar along the bottom, the notice, the alert --------
  const ALERT_W = Math.min(300, W - 32);
  const alertLines = () => wrap(alert()?.message ?? "", FONT.xs, ALERT_W - 32, 5);
  const alertH = () => 54 + alertLines().length * 16 + 56;
  const alertY = () => Math.round((SCREEN_H - alertH()) / 2);
  const alertButtonW = (ALERT_W - 16 * 2 - 10) / 2;
  const closeAlert = () => setAlert(null);
  const confirmAlert = () => {
    const open = alert();
    setAlert(null);
    open?.run();
  };
  const noticeY = () => SCREEN_H - env.bottom() - 46;
  /** The notice's action, as wide as its label. */
  const actionW = () => {
    const action = model.notice()?.action;
    return action ? Math.ceil(measure(action.label, FONT.xsBold)) + 16 : 0;
  };
  const noticeTargets = (): Target[] => {
    const shown = model.notice();
    if (!shown?.action) return [];
    return [{ id: "notice.action", x: 12, y: noticeY(), w: W - 24, h: 38, run: shown.action.run }];
  };
  const touchPage = (): TouchPage | null => {
    if (alert()) {
      const y = alertY() + alertH() - 46;
      const targets: Target[] = [
        { id: "alert.cancel", x: (W - ALERT_W) / 2 + 16, y, w: alertButtonW, h: 34, run: closeAlert },
        { id: "alert.action", x: (W - ALERT_W) / 2 + 26 + alertButtonW, y, w: alertButtonW, h: 34, run: confirmAlert },
      ];
      return { targets: () => targets };
    }
    const page = stack.touch();
    if (!page) return null;
    const bar = bottom();
    const cut = SCREEN_H - (bar ? miniHeight() : 0);
    return {
      ...page,
      targets: () => [
        ...page.targets(),
        ...(bar === "mini" ? miniTargets(env) : bar === "speaker" ? speakerTargets(env) : bar === "premium" ? [{ id: "premium", x: 0, y: cut, w: W, h: SCREEN_H - cut }] : []),
        ...noticeTargets(),
      ],
      scroll: page.scroll ? { ...page.scroll, bottom: Math.min(page.scroll.bottom, cut) } : undefined,
    };
  };
  createTouchRouter({
    surface: appletSurfaceId(),
    press,
    page: touchPage,
    active: () => !stack.busy() && (keyboardElsewhere() || !osk.isOpen()),
    onTouch: () => setKeys(false),
  });

  onButtonPress(ALL_BUTTONS, (pressed) => {
    if (alert()) {
      if (pressed & BTN.CIRCLE) confirmAlert();
      else if (pressed & BTN.CROSS) closeAlert();
      return;
    }
    if (osk.isOpen()) return;
    if (stack.key(pressed)) return;
    if (pressed & BTN.START && model.phase() === "ready" && stack.top()?.page !== "player") stack.push("player");
  });

  const keyboardTop = SCREEN_H - oskHeight(appletSurfaceId(), "dark");
  return (
    <AppletSurface>
      <View class="relative w-full h-full overflow-hidden" style={{ bgColor: C.bg }}>
        {stack.view()}
        <Show when={bottom() === "mini"}>
          <MiniPlayer env={env} />
        </Show>
        <Show when={bottom() === "premium"}>
          <PremiumNote env={env} />
        </Show>
        <Show when={bottom() === "speaker"}>
          <SpeakerNote env={env} />
        </Show>
        <Show when={model.notice()}>
          {(shown) => (
            <>
              <View class="absolute" style={{ insetL: 12, insetT: noticeY(), width: W - 24, height: 38, radius: 6, bgColor: shown().failed ? "#c7253b" : C.white }} />
              <Show
                when={shown().action ? null : wrap(shown().text, FONT.xsBold, W - 48, 3).length > 1}
                fallback={
                  <Text class="absolute text-xs font-bold" style={{ insetL: 24, insetT: noticeY() + 12, width: W - 48 - actionW(), textColor: shown().failed ? C.white : C.black }}>
                    {wrap(shown().text, FONT.xsBold, W - 48 - actionW(), 1)[0] ?? ""}
                  </Text>
                }
              >
                <Text class="absolute text-xs font-bold leading-[14]" style={{ insetL: 24, insetT: noticeY() + 5, width: W - 48, textColor: shown().failed ? C.white : C.black }}>
                  {wrap(shown().text, FONT.xsBold, W - 48, 2).join("\n")}
                </Text>
              </Show>
              <Show when={shown().action}>
                {(action) => <Text class="absolute text-xs font-bold text-right" style={{ insetL: W - 24 - actionW(), insetT: noticeY() + 12, width: actionW(), textColor: shown().failed ? C.white : C.accent }}>{action().label}</Text>}
              </Show>
            </>
          )}
        </Show>
        <Show when={alert()}>
          {(open) => (
            <View class="absolute left-0 top-0" style={{ width: SCREEN_W, height: SCREEN_H, bgColor: C.shade }}>
              <View class="absolute" style={{ insetL: (W - ALERT_W) / 2, insetT: alertY(), width: ALERT_W, height: alertH(), radius: 10, bgColor: C.raised }} />
              <Text class="absolute text-base font-bold text-center" style={{ insetL: (W - ALERT_W) / 2 + 16, insetT: alertY() + 18, width: ALERT_W - 32, textColor: C.text }}>{open().title}</Text>
              <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: (W - ALERT_W) / 2 + 16, insetT: alertY() + 46, width: ALERT_W - 32, textColor: C.muted }}>{alertLines().join("\n")}</Text>
              <Pill x={(W - ALERT_W) / 2 + 16} y={alertY() + alertH() - 46} w={alertButtonW} h={34} label="Cancel" lit={() => press.is("alert.cancel")} />
              <Pill x={(W - ALERT_W) / 2 + 26 + alertButtonW} y={alertY() + alertH() - 46} w={alertButtonW} h={34} label={open().action} primary lit={() => press.is("alert.action")} />
            </View>
          )}
        </Show>
        <View class="absolute left-0" style={{ insetT: keyboardTop, width: SCREEN_W, height: SCREEN_H - keyboardTop }}>
          <Osk osk={osk} surface={appletSurfaceId()} theme="dark" />
        </View>
      </View>
      <Legend home />
    </AppletSurface>
  );
}
