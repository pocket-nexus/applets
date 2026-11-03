// SPDX-License-Identifier: GPL-3.0-or-later
// spotify/model.ts — what the Spotify applet knows, apart from its pages:
// the service's status and the sign-in, the player and the commands that
// change it, what is liked, a short notice over the pages, and the answers
// the pages show, kept by key so going back does not ask again.
//
// The status is asked for every STATUS_SIGNIN_MS while no one is signed in
// (the owner may confirm a pairing at any moment), less often after. The
// player is asked for every PLAYER_SHOWN_MS while Now Playing is on screen and
// every PLAYER_HIDDEN_MS otherwise, and every command answers the player as it is
// after it, which replaces the one shown. A poll that left before a command
// and answers after it is dropped: it describes the player before the
// command. Between answers the position moves on by the clock (format.ts
// progressAt).

import { batch, createSignal, type Accessor } from "solid-js";
import { after } from "@pocketjs/framework/clock";
import { companionNow } from "../lib/net.ts";
import { notLinked } from "../ui/companion.ts";
import { SpotifyError, type Reason, type SearchType, type Shelf, type SpotifyClient } from "./api.ts";
import type { Device, Item, Page, Player, PlayRequest, Status } from "./contract.ts";
import { appendPage, failureText, nextRepeat, progressAt } from "./format.ts";

export const STATUS_SIGNIN_MS = 2_000;
export const STATUS_READY_MS = 30_000;
export const PLAYER_SHOWN_MS = 3_000;
export const PLAYER_HIDDEN_MS = 10_000;
/** After Spotify asked to wait (reason `rate`). */
export const RATE_WAIT_MS = 15_000;
/** Answers kept for going back to. */
export const ANSWERS_KEPT = 24;
/** A volume step, in percent. */
export const VOLUME_STEP = 10;

export type Phase = "loading" | "offline" | "signin" | "ready";

/** A failure as a page shows it. */
export interface Problem {
  title: string;
  detail: string;
  reason: Reason;
}

export function problemOf(error: unknown): Problem {
  if (error instanceof SpotifyError) {
    if (error.reason === "unavailable") return { ...notLinked("Spotify"), reason: error.reason };
    if (error.reason === "timeout") return { title: "Spotify did not answer in time", detail: "The request timed out.", reason: error.reason };
    const title = failureText({ reason: error.reason, error: error.message });
    return { title, detail: error.message !== title ? error.message : "", reason: error.reason };
  }
  return { title: "Could not load this", detail: error instanceof Error ? error.message : String(error), reason: "other" };
}

export interface Query<T> {
  data: Accessor<T | null>;
  problem: Accessor<Problem | null>;
  loading: Accessor<boolean>;
  reload(): void;
}

export interface Paged {
  items: Accessor<readonly Item[]>;
  total: Accessor<number | null>;
  problem: Accessor<Problem | null>;
  /** The first page is on its way. */
  loading: Accessor<boolean>;
  /** A later page is on its way. */
  loadingMore: Accessor<boolean>;
  hasMore: Accessor<boolean>;
  more(): void;
  reload(): void;
}

export interface Answers {
  query<T>(key: string, load: () => Promise<T>): Query<T>;
  /** A list asked for a page at a time. */
  paged(key: string, load: (next: string | null) => Promise<Page>): Paged;
  /** The pages after `first` (an album's or a playlist's tracks, whose first
   *  page comes with the album): `first` changing starts it over. */
  continued(key: string, first: Accessor<Page | null>, load: (next: string) => Promise<Page>): Paged;
  /** Forget every answer whose key starts with `prefix`. */
  forget(prefix: string): void;
}

function createAnswers(limit: number): Answers {
  const kept = new Map<string, unknown>();
  const remember = <T,>(key: string, value: T): T => {
    kept.set(key, value);
    while (kept.size > limit) kept.delete(kept.keys().next().value as string);
    return value;
  };
  const known = <T,>(key: string): T | undefined => {
    const value = kept.get(key) as T | undefined;
    if (value !== undefined) {
      kept.delete(key);
      kept.set(key, value);
    }
    return value;
  };
  return {
    query<T>(key: string, load: () => Promise<T>): Query<T> {
      const have = known<Query<T>>(key);
      if (have) return have;
      const [data, setData] = createSignal<T | null>(null);
      const [problem, setProblem] = createSignal<Problem | null>(null);
      const [loading, setLoading] = createSignal(true);
      let run = 0;
      const reload = () => {
        const mine = ++run;
        setLoading(true);
        load().then(
          (value) => {
            if (mine !== run) return;
            batch(() => {
              setData(() => value);
              setProblem(null);
              setLoading(false);
            });
          },
          (failure: unknown) => {
            if (mine !== run) return;
            batch(() => {
              setProblem(problemOf(failure));
              setLoading(false);
            });
          },
        );
      };
      reload();
      return remember(key, { data, problem, loading, reload });
    },
    paged(key, load) {
      const have = known<Paged>(key);
      if (have) return have;
      const [items, setItems] = createSignal<readonly Item[]>([]);
      const [total, setTotal] = createSignal<number | null>(null);
      const [problem, setProblem] = createSignal<Problem | null>(null);
      const [loading, setLoading] = createSignal(true);
      const [loadingMore, setLoadingMore] = createSignal(false);
      const [next, setNext] = createSignal<string | null>(null);
      let run = 0;
      const reload = () => {
        const mine = ++run;
        batch(() => {
          setLoading(true);
          setProblem(null);
        });
        load(null).then(
          (page) => {
            if (mine !== run) return;
            batch(() => {
              setItems(appendPage([], page));
              setTotal(page.total);
              setNext(page.next);
              setLoading(false);
            });
          },
          (failure: unknown) => {
            if (mine !== run) return;
            batch(() => {
              setProblem(problemOf(failure));
              setLoading(false);
            });
          },
        );
      };
      const more = () => {
        const token = next();
        if (!token || loading() || loadingMore()) return;
        const mine = run;
        setLoadingMore(true);
        load(token).then(
          (page) => {
            if (mine !== run) return;
            batch(() => {
              setItems(appendPage(items(), page));
              setNext(page.next);
              setLoadingMore(false);
            });
          },
          (failure: unknown) => {
            if (mine !== run) return;
            batch(() => {
              setLoadingMore(false);
              setNext(null);
              setProblem(problemOf(failure));
            });
          },
        );
      };
      reload();
      return remember(key, { items, total, problem, loading, loadingMore, hasMore: () => next() !== null, more, reload });
    },
    continued(key, first, load) {
      const have = known<Paged>(key);
      if (have) return have;
      const [extra, setExtra] = createSignal<{ base: Page; items: readonly Item[]; next: string | null } | null>(null);
      const [problem, setProblem] = createSignal<Problem | null>(null);
      const [loadingMore, setLoadingMore] = createSignal(false);
      const current = () => {
        const base = first();
        const more = extra();
        return base && more && more.base === base ? more : null;
      };
      const items = () => current()?.items ?? first()?.items ?? [];
      const next = () => {
        const more = current();
        return more ? more.next : first()?.next ?? null;
      };
      return remember(key, {
        items,
        total: () => first()?.total ?? null,
        problem,
        loading: () => first() === null,
        loadingMore,
        hasMore: () => next() !== null,
        more() {
          const base = first();
          const token = next();
          if (!base || !token || loadingMore()) return;
          setLoadingMore(true);
          load(token).then(
            (page) => {
              batch(() => {
                if (first() === base) setExtra({ base, items: appendPage(items(), page), next: page.next });
                setLoadingMore(false);
              });
            },
            (failure: unknown) => {
              batch(() => {
                setLoadingMore(false);
                setProblem(problemOf(failure));
              });
            },
          );
        },
        reload() {
          setExtra(null);
          setProblem(null);
        },
      });
    },
    forget(prefix) {
      for (const key of [...kept.keys()]) if (key.startsWith(prefix)) kept.delete(key);
    },
  };
}

export interface Notice {
  text: string;
  failed: boolean;
  action?: { label: string; run: () => void };
}

export interface SpotifyModel {
  client: SpotifyClient;
  answers: Answers;
  status: Accessor<Status | null>;
  phase: Accessor<Phase>;
  /** The service did not answer the status. */
  offline: Accessor<Problem | null>;
  refreshStatus(): void;
  /** Start a pairing (POST /signin). */
  signIn(): void;
  /** POST /signin is on its way. */
  starting: Accessor<boolean>;
  /** The pairing to show: the service's, unless Cancel hid it. */
  pendingSignIn: Accessor<Status["signIn"]>;
  cancelSignIn(): void;
  signOut(): void;
  /** What keeps this device's speaker from playing (starting, refused by
   *  Spotify, waiting to be picked, stopped), else "". */
  speakerNote: Accessor<string>;
  /** Spotify refuses this speaker audio and Spotify's own player is not set
   *  up yet: the pages offer its setup. */
  offerSetup: Accessor<boolean>;
  /** Open the setup of Spotify's own player (set by the app). */
  openSetup(): void;
  setOpenSetup(open: () => void): void;
  /** Said where playing would start while the account has no Premium, else "". */
  premiumNote: Accessor<string>;
  player: Accessor<Player | null>;
  /** The playing item's position now, in ms. */
  position(): number;
  /** Now Playing is on screen: the player is asked for more often. */
  setPlayerShown(shown: boolean): void;
  refreshPlayer(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  nudgeVolume(by: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  /** Play an album, a playlist, an artist or Liked Songs, from a track
   *  (its uri) or a place, or shuffled. */
  play(context: string, from?: { uri?: string; position?: number }, shuffled?: { count: number }): void;
  /** Play tracks with no album or playlist around them. */
  playUris(uris: string[]): void;
  transfer(device: Device): void;
  /** The devices Spotify lists, asked for again each time a page opens it. */
  devices(): Query<Device[]>;
  /** Move playback to this device's speaker. */
  playHere(): void;
  /** Whether `uri` is liked, as far as is known. */
  liked(uri: string): boolean | null;
  /** What the service said about `uri` when nothing has changed it since. */
  knowLiked(uri: string, liked: boolean): void;
  toggleLike(uri: string): void;
  notice: Accessor<Notice | null>;
  say(text: string, failed?: boolean, action?: Notice["action"]): void;
  /** Library and search choices, kept across pages and remounts. */
  shelf: Accessor<Shelf>;
  setShelf(shelf: Shelf): void;
  words: Accessor<string>;
  setWords(words: string): void;
  kind: Accessor<SearchType>;
  setKind(kind: SearchType): void;
  /** Called once a frame: asks for the status and the player when due. */
  tick(): void;
}

export function createSpotifyModel(client: SpotifyClient): SpotifyModel {
  const answers = createAnswers(ANSWERS_KEPT);
  const [status, setStatus] = createSignal<Status | null>(null);
  const [offline, setOffline] = createSignal<Problem | null>(null);
  const [starting, setStarting] = createSignal(false);
  const [hidden, setHidden] = createSignal("");
  const [player, setPlayerSignal] = createSignal<Player | null>(null);
  const [notice, setNotice] = createSignal<Notice | null>(null);
  const [likes, setLikes] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  const [shelf, setShelf] = createSignal<Shelf>("playlists");
  const [words, setWords] = createSignal("");
  const [kind, setKind] = createSignal<SearchType>("track");
  /** The clock (companionNow) when the shown player's answer arrived. */
  let receivedAt = 0;
  let shown = false;
  let statusBusy = false;
  let playerBusy = false;
  let nextStatusAt = 0;
  let nextPlayerAt = 0;
  /** Bumps with every command: a poll from before one is dropped. */
  let generation = 0;
  let commands = 0;
  let noticeRun = 0;
  let devices: readonly Device[] = [];

  const phase = (): Phase => {
    const value = status();
    if (!value) return offline() ? "offline" : "loading";
    if (!value.signedIn) return "signin";
    return "ready";
  };

  const say = (text: string, failed = false, action?: Notice["action"]) => {
    const run = ++noticeRun;
    setNotice({ text, failed, ...(action ? { action } : {}) });
    after(action ? 8 : failed ? 5 : 2.5, () => {
      if (run === noticeRun) setNotice(null);
    });
  };

  const setPlayer = (next: Player | null, now = companionNow()) => {
    const before = player();
    // The same answer again (nothing moved since) keeps the clock it started on.
    const same = before && next && before.playing === next.playing && before.progressMs === next.progressMs && before.at === next.at && before.item?.uri === next.item?.uri;
    if (!same) receivedAt = now;
    if (next?.item && typeof next.liked === "boolean") knowLiked(next.item.uri, next.liked);
    if (next?.device) devices = [next.device, ...devices.filter((device) => device.id !== next.device!.id)];
    setPlayerSignal(next);
  };

  const applyStatus = (value: Status) => {
    const was = status();
    batch(() => {
      setStatus(value);
      setOffline(null);
    });
    if (was?.signedIn && !value.signedIn) {
      answers.forget("");
      setPlayerSignal(null);
    }
    if (!was?.signedIn && value.signedIn) nextPlayerAt = 0;
  };

  const refreshStatus = () => {
    if (statusBusy) return;
    statusBusy = true;
    client.status().then(
      (value) => {
        statusBusy = false;
        applyStatus(value);
      },
      (error: unknown) => {
        statusBusy = false;
        if (error instanceof SpotifyError && error.reason === "rate") nextStatusAt = companionNow() + RATE_WAIT_MS;
        setOffline(problemOf(error));
      },
    );
    nextStatusAt = companionNow() + (phase() === "ready" ? STATUS_READY_MS : STATUS_SIGNIN_MS);
  };

  const refreshPlayer = () => {
    if (playerBusy || phase() !== "ready") return;
    playerBusy = true;
    const mine = generation;
    nextPlayerAt = companionNow() + (shown ? PLAYER_SHOWN_MS : PLAYER_HIDDEN_MS);
    client.player().then(
      (value) => {
        playerBusy = false;
        if (mine === generation && commands === 0) setPlayer(value);
      },
      (error: unknown) => {
        playerBusy = false;
        if (error instanceof SpotifyError && error.reason === "rate") nextPlayerAt = companionNow() + RATE_WAIT_MS;
      },
    );
  };

  /** What a failed command or page tells the reader, and what it can do. */
  const fail = (error: unknown) => {
    const reason = error instanceof SpotifyError ? error.reason : "other";
    if (reason === "signin") {
      refreshStatus();
      return;
    }
    if (reason === "nodevice") {
      // nothing plays anywhere: this device's speaker, when it is one of Spotify's devices
      if (!localSpeaker() || speakerNote()) return say(speakerNote() || failureText({ reason, error: "" }), true, setupAction());
      return say(failureText({ reason, error: "" }), true, { label: "Play on this device", run: () => model.playHere() });
    }
    if (reason === "unavailable") return say(notLinked("Spotify").title, true);
    say(error instanceof SpotifyError ? failureText({ reason: error.reason, error: error.message }) : String(error), true);
  };
  client.onFailure((error) => {
    if (error.reason === "signin" || error.reason === "premium") refreshStatus();
  });

  /** Run a command; its answer is the player after it. `undo` puts back
   *  what an optimistic change showed when the command fails. */
  const command = (job: () => Promise<Player>, undo?: Player | null) => {
    generation++;
    commands++;
    job().then(
      (value) => {
        commands--;
        setPlayer(value);
        nextPlayerAt = companionNow() + (shown ? PLAYER_SHOWN_MS : PLAYER_HIDDEN_MS);
      },
      (error: unknown) => {
        commands--;
        if (undo !== undefined) setPlayer(undo);
        fail(error);
      },
    );
  };

  /** The player with the position taken now, so a change keeps it. */
  const settled = (from: Player): Player => {
    const now = companionNow();
    return { ...from, progressMs: progressAt(from, now, receivedAt), at: now };
  };

  const knowLiked = (uri: string, liked: boolean) => {
    if (likes().get(uri) === liked) return;
    const next = new Map(likes());
    next.set(uri, liked);
    setLikes(next);
  };

  let volumeBusy = false;
  let volumeWanted: number | null = null;
  const sendVolume = (percent: number) => {
    volumeBusy = true;
    generation++;
    client.volume(percent).then(
      (value) => {
        volumeBusy = false;
        if (volumeWanted !== null) {
          const wanted = volumeWanted;
          volumeWanted = null;
          return sendVolume(wanted);
        }
        setPlayer(value);
      },
      (error: unknown) => {
        volumeBusy = false;
        volumeWanted = null;
        fail(error);
        refreshPlayer();
      },
    );
  };

  const localSpeaker = (): string | null => status()?.speaker.id ?? devices.find((device) => device.local)?.id ?? null;

  const speakerNote = () => {
    const speaker = status()?.speaker;
    if (!speaker || phase() !== "ready") return "";
    const name = speaker.name || "This device";
    if (speaker.state === "starting") return `${name}'s speaker is starting.`;
    if (speaker.state === "refused") return speaker.setup ? "Spotify won't send this speaker audio for your account. Set up Spotify's own player." : speaker.message || "Spotify won't send this speaker audio for your account.";
    if (speaker.state === "pair") return `Pick ${name} in Spotify on a phone or computer on this network, once.`;
    if (speaker.state === "error") return speaker.message || `${name}'s speaker stopped.`;
    return "";
  };
  const offerSetup = () => {
    const speaker = status()?.speaker;
    return phase() === "ready" && !!speaker && speaker.state === "refused" && speaker.setup;
  };
  let openSetup = () => {};
  /** A notice's way to the setup, when there is one to offer. */
  const setupAction = (): Notice["action"] => (offerSetup() ? { label: "Set Up", run: () => openSetup() } : undefined);
  const premiumNote = () => (phase() === "ready" && status()?.premium === false ? "Spotify Premium is needed to play. Browsing works without it." : "");

  const model: SpotifyModel = {
    client,
    answers,
    status,
    phase,
    offline,
    refreshStatus,
    signIn() {
      if (starting()) return;
      setStarting(true);
      client.signIn().then(
        (value) => {
          setStarting(false);
          setHidden("");
          applyStatus(value);
        },
        (error: unknown) => {
          setStarting(false);
          fail(error);
        },
      );
    },
    starting,
    pendingSignIn: () => {
      const pending = status()?.signIn ?? null;
      return pending && pending.url !== hidden() ? pending : null;
    },
    cancelSignIn() {
      // the pairing page goes at once (pendingSignIn hides this URL); POST
      // /cancel has the service forget the pairing, and its Status is applied
      setHidden(status()?.signIn?.url ?? "");
      client.cancelSignIn().then(applyStatus, fail);
    },
    signOut() {
      client.signOut().then(applyStatus, fail);
    },
    speakerNote,
    offerSetup,
    openSetup: () => openSetup(),
    setOpenSetup(open) {
      openSetup = open;
    },
    premiumNote,
    player,
    position() {
      const value = player();
      return value ? progressAt(value, companionNow(), receivedAt) : 0;
    },
    setPlayerShown(on) {
      if (on === shown) return;
      shown = on;
      if (on) nextPlayerAt = 0;
    },
    refreshPlayer,
    toggle() {
      const value = player();
      if (!value?.active || !value.item) return model.playHere();
      const before = value;
      setPlayer({ ...settled(value), playing: !value.playing });
      command(() => client.command(value.playing ? "pause" : "resume"), before);
    },
    next: () => command(() => client.command("next")),
    previous: () => command(() => client.command("previous")),
    seek(positionMs) {
      const value = player();
      if (!value?.item) return;
      const before = value;
      const now = companionNow();
      setPlayer({ ...value, progressMs: Math.max(0, Math.min(positionMs, value.item.durationMs ?? positionMs)), at: now }, now);
      command(() => client.seek(positionMs), before);
    },
    nudgeVolume(by) {
      const value = player();
      const device = value?.device;
      if (!value || !device || device.volume === null) return;
      const percent = Math.max(0, Math.min(100, device.volume + by));
      if (percent === device.volume) return;
      setPlayer({ ...value, device: { ...device, volume: percent } });
      if (volumeBusy) volumeWanted = percent;
      else sendVolume(percent);
    },
    toggleShuffle() {
      const value = player();
      if (!value?.active) return;
      setPlayer({ ...value, shuffle: !value.shuffle });
      command(() => client.shuffle(!value.shuffle), value);
    },
    cycleRepeat() {
      const value = player();
      if (!value?.active) return;
      const mode = nextRepeat(value.repeat);
      setPlayer({ ...value, repeat: mode });
      command(() => client.repeat(mode), value);
    },
    play(context, from, shuffled) {
      const request: PlayRequest = { context };
      if (shuffled && shuffled.count > 0) request.offset = { position: Math.floor(Math.random() * shuffled.count) };
      else if (from?.uri) request.offset = { uri: from.uri };
      else if (from?.position !== undefined) request.offset = { position: from.position };
      command(async () => {
        const answer = await client.play(request);
        if (!shuffled) return answer;
        return answer.shuffle ? answer : client.shuffle(true);
      });
    },
    playUris(uris) {
      if (uris.length) command(() => client.play({ uris }));
    },
    transfer(device) {
      if (device.restricted) return say(failureText({ reason: "restricted", error: "" }), true);
      command(() => client.transfer(device.id, true));
    },
    devices() {
      const known = answers.query("devices", () =>
        client.devices().then((list) => {
          devices = list;
          return devicesInOrder(list);
        }),
      );
      return known;
    },
    playHere() {
      const id = localSpeaker();
      if (premiumNote()) return say(failureText({ reason: "premium", error: "" }), true);
      if (!id || speakerNote()) return say(speakerNote() || "This device's speaker is not ready.", true, setupAction());
      command(() => client.transfer(id, true));
    },
    liked: (uri) => likes().get(uri) ?? null,
    knowLiked,
    toggleLike(uri) {
      const was = likes().get(uri) ?? false;
      knowLiked(uri, !was);
      const value = player();
      if (value?.item?.uri === uri) setPlayerSignal({ ...value, liked: !was });
      client.like(uri, !was).then(
        (answer) => {
          knowLiked(uri, answer.liked);
          say(answer.liked ? "Added to Liked Songs" : "Removed from Liked Songs");
          answers.forget("library.tracks");
        },
        (error: unknown) => {
          knowLiked(uri, was);
          fail(error);
        },
      );
    },
    notice,
    say,
    shelf,
    setShelf,
    words,
    setWords,
    kind,
    setKind,
    tick() {
      const now = companionNow();
      if (now >= nextStatusAt) refreshStatus();
      if (phase() === "ready" && commands === 0 && now >= nextPlayerAt) refreshPlayer();
    },
  };
  return model;
}

/** The devices list with this device's speaker first, then the active one. */
export function devicesInOrder(list: readonly Device[]): Device[] {
  return [...list].sort((a, b) => Number(b.local) - Number(a.local) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
