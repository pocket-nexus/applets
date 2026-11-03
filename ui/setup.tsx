// SPDX-License-Identifier: GPL-3.0-or-later
// ui/setup.tsx — the owner setup page an applet drawn with ../ui shows for
// any companion service: what `/_setup` answers (ui/setup-state.ts, PocketJS
// tools/companion/setup.ts), laid out top to bottom as positioned View and
// Text in the palette the applet passes. An applet on ../kit cannot import it
// (tools/check.ts holds those to ../kit).
//
//   the prompt     what the owner does elsewhere: pick this device in a
//                  vendor's app (its title and detail), or confirm a code at
//                  a vendor's page (the code large, a QR code of the page)
//   a field        its label, Set or Not set, its help, where to get the value
//                  (in words, and a QR code where there is room), and an entry
//                  the keyboard types into: dots for a secret; Clear once set
//   a tool         its title, its vendor, its note, the vendor's terms, and a
//                  button that says it accepts them and downloads; the bytes
//                  while it downloads, the failure with Retry, Ready
//
// The page asks for the state every 2 s while it is open and no change is
// out; a change's answer is the state after it. An answer is taken only when
// no change was sent after its request went out: one the service gave before
// a later change would undo that change on the page. An applet passes the
// service's `/_setup` URL, its palette (as it passes ui/bar.tsx its
// BarColors) and its keyboard.
//
// The words are drawn in the baked face (ui/text.ts), which holds the
// bundle's literals and printable ASCII. What the service answers arrives at
// run time and can hold any character, so each string goes through toAscii
// before it reaches a <Text>.

import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { fetch, NetError } from "../lib/net.ts";
import type { BarColors } from "./bar.tsx";
import type { LayerContext, PageContent, PageSpec } from "./nav.tsx";
import { Qr } from "./qr.tsx";
import { entryText, progressFraction, readSetup, shownUrl, stepsLeft, toolAction, toolStatus, type SetupChange, type SetupFieldState, type SetupState } from "./setup-state.ts";
import { ellipsize, FONT, measure, toAscii, wrap } from "./text.ts";
import { SCREEN_H } from "./screen.ts";
import type { Press, Target } from "./touch.ts";

/** The page's colours. */
export interface SetupPalette {
  bg: string;
  /** a block's ground: the prompt, an entry */
  surface: string;
  raised: string;
  line: string;
  text: string;
  muted: string;
  /** a link, an entry being typed into */
  link: string;
  /** the button that does the step, and its words */
  primary: string;
  onPrimary: string;
  ok: string;
  bad: string;
  /** a control while pressed or focused */
  lit: string;
}

export interface SetupPageOptions {
  /** the service's `/_setup`: companionService("<service>", "/_setup") */
  url: string;
  layer: LayerContext;
  press: Press;
  keys: Accessor<boolean>;
  width: number;
  /** the scrolling view's height */
  view: number;
  palette: SetupPalette;
  barColors?: BarColors;
  /** px along the bottom the applet keeps free (PageSpec.inset) */
  inset?: number;
  /** the bar's title; the state's title when absent */
  title?: string;
  /** Open the keyboard on a field; `commit` gets what was typed. */
  edit(field: SetupFieldState, commit: (text: string) => void): void;
  /** The keyboard's text with its caret while it types into `field`, else null. */
  draft(field: string): string | null;
  /** The setup became ready. */
  onReady?(): void;
}

const POLL_MS = 2_000;
const PAD = 12;
const ENTRY_H = 30;
const BUTTON_H = 30;
const LINE = 16;
/** The last state each service answered: the page opens on it, then asks again. */
const known = new Map<string, SetupState>();

/** GET or POST `/_setup`; a refused change rejects with the service's words. */
async function ask(url: string, change?: SetupChange): Promise<SetupState> {
  let response;
  try {
    response = await fetch(url, {
      timeoutMs: 20_000,
      maxBytes: 64 * 1024,
      ...(change ? { method: "POST" as const, headers: { "content-type": "application/json" }, body: JSON.stringify(change) } : {}),
    });
  } catch (error) {
    throw new Error(error instanceof NetError && error.code === "unavailable" ? "The service is not answering." : error instanceof Error ? error.message : String(error));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // no JSON: the status says it
  }
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error || `The service answered ${response.status}.`);
  const state = readSetup(body);
  if (!state) throw new Error("The service's setup answer was not one.");
  return state;
}

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  run: () => void;
}

export function setupPage(options: SetupPageOptions): PageSpec {
  const P = options.palette;
  const W = options.width;
  const { layer, press } = options;
  const [state, setState] = createSignal<SetupState | null>(known.get(options.url) ?? null);
  const [problem, setProblem] = createSignal("");
  /** the last change the service refused, by the field or tool it was for */
  const [refused, setRefused] = createSignal<{ id: string; message: string } | null>(null);
  /** the control of each change out: a control says "Working" while one of its changes is out */
  const [busy, setBusy] = createSignal<readonly string[]>([]);
  let asking = false;
  let nextAt = 0;
  /** changes sent so far: an answer to a request that went out before the latest is dropped */
  let sent = 0;
  let wasReady = state()?.ready ?? false;
  const take = (value: SetupState) => {
    known.set(options.url, value);
    setState(value);
    setProblem("");
    if (value.ready && !wasReady) options.onReady?.();
    wasReady = value.ready;
  };
  const refresh = () => {
    if (asking || busy().length > 0) return;
    asking = true;
    const mine = sent;
    nextAt = Date.now() + POLL_MS;
    ask(options.url).then(
      (value) => {
        asking = false;
        if (mine === sent) take(value);
      },
      (error: unknown) => {
        asking = false;
        setProblem(error instanceof Error ? error.message : String(error));
      },
    );
  };
  /** Send `change` from the control `control`; a refusal shows under the field or tool `id`. */
  const send = (control: string, id: string, change: SetupChange) => {
    const mine = ++sent;
    setBusy((now) => [...now, control]);
    setRefused(null);
    const landed = () =>
      setBusy((now) => {
        const at = now.indexOf(control);
        return now.filter((_, index) => index !== at);
      });
    // the change answers the state after it: the next look waits a full interval
    nextAt = Date.now() + POLL_MS;
    ask(options.url, change).then(
      (value) => {
        landed();
        nextAt = Date.now() + POLL_MS;
        // a later change's answer holds this one too
        if (mine === sent) take(value);
      },
      (error: unknown) => {
        landed();
        setRefused({ id, message: error instanceof Error ? error.message : String(error) });
      },
    );
  };
  onFrame(() => {
    if (Date.now() >= nextAt) refresh();
  });

  const lit = (id: string) => press.is(id) || (options.keys() && layer.focus() === id);
  const textW = W - PAD * 2;
  // a field's QR code beside it when the page is wide enough
  const QR = W >= 400 ? 84 : 0;

  /** The page laid out: each block's lines and controls, top to bottom. */
  const layout = createMemo(() => {
    const value = state();
    const controls: Placed[] = [];
    let y = 10;
    if (!value) return { y: 0, controls, blocks: null };
    const title = y;
    y += 24;
    const status = y;
    y += LINE + 10;
    const prompt = value.prompt
      ? (() => {
          const top = y;
          const qr = value.prompt.kind === "code" && value.prompt.url ? (W >= 400 ? 96 : 0) : 0;
          const innerW = textW - 20 - (qr ? qr + 12 : 0);
          const titleLines = wrap(toAscii(value.prompt.title), FONT.smBold, innerW, 3);
          const detailLines = value.prompt.detail ? wrap(toAscii(value.prompt.detail), FONT.xs, innerW, 6) : [];
          let h = 10 + titleLines.length * 18 + (detailLines.length ? 4 + detailLines.length * LINE : 0);
          const codeY = top + h + 6;
          if (value.prompt.kind === "code" && value.prompt.code) h += 6 + 26;
          const urlY = top + h + 4;
          if (value.prompt.kind === "code" && value.prompt.url) h += 4 + LINE;
          h = Math.max(h + 10, qr ? qr + 20 : 0);
          y += h + 12;
          return { top, h, qr, innerW, titleLines, detailLines, codeY, urlY };
        })()
      : null;
    const fields = value.fields.map((field) => {
      const top = y;
      const qr = field.link && QR ? QR : 0;
      const innerW = textW - (qr ? qr + 12 : 0);
      const helpLines = field.help ? wrap(toAscii(field.help), FONT.xs, innerW, 4) : [];
      const linkLines = field.link ? wrap(`Get it at ${toAscii(field.link.label)}`, FONT.xs, innerW, 2) : [];
      let at = top + 18;
      const helpY = at;
      at += helpLines.length * LINE;
      const linkY = at;
      at += linkLines.length * LINE;
      // the entry under the QR code, which stands beside the field's words
      const entryY = Math.max(at + 6, qr ? top + qr + 8 : 0);
      const clearW = field.set ? 70 : 0;
      const entryW = textW - (clearW ? clearW + 8 : 0);
      controls.push({ id: `setup.field.${field.id}`, x: PAD, y: entryY, w: entryW, h: ENTRY_H, run: () => options.edit(field, (text) => send(`setup.field.${field.id}`, field.id, { field: field.id, value: text })) });
      if (field.set) controls.push({ id: `setup.clear.${field.id}`, x: PAD + entryW + 8, y: entryY, w: clearW, h: ENTRY_H, run: () => send(`setup.clear.${field.id}`, field.id, { field: field.id, clear: true }) });
      let bottom = entryY + ENTRY_H;
      const errorY = bottom + 4;
      const errorLines = refused()?.id === field.id ? wrap(toAscii(refused()!.message), FONT.xs, textW, 3) : [];
      bottom += errorLines.length ? 4 + errorLines.length * LINE : 0;
      y = bottom + 16;
      return { field, top, qr, innerW, helpLines, linkLines, helpY, linkY, entryY, entryW, clearW, errorY, errorLines };
    });
    const tools = value.tools.map((tool) => {
      const top = y;
      const noteLines = tool.note ? wrap(toAscii(tool.note), FONT.xs, textW, 4) : [];
      let at = top + 18;
      const vendorY = at;
      at += LINE;
      const noteY = at;
      at += noteLines.length * LINE;
      const termsY = at;
      at += tool.terms ? LINE : 0;
      const statusY = at + 4;
      const statusLines = wrap(toAscii(refused()?.id === tool.id ? refused()!.message : toolStatus(tool)), FONT.xs, textW, 3);
      at = statusY + statusLines.length * LINE;
      const barY = at + 4;
      if (tool.state === "fetching") at = barY + 4;
      const action = toolAction(tool);
      const buttonY = at + 8;
      const buttonW = action ? Math.min(textW, Math.ceil(measure(action.label, FONT.xsBold)) + 32) : 0;
      if (action) {
        controls.push({ id: `setup.tool.${tool.id}`, x: PAD, y: buttonY, w: buttonW, h: BUTTON_H, run: () => send(`setup.tool.${tool.id}`, tool.id, action.change) });
        at = buttonY + BUTTON_H;
      }
      y = at + 16;
      return { tool, top, noteLines, vendorY, noteY, termsY, statusY, statusLines, barY, action, buttonY, buttonW };
    });
    return { y, controls, blocks: { title, status, prompt, fields, tools } };
  });

  const problemTop = 24;
  const retry: Placed = { id: "setup.retry", x: (W - 140) / 2, y: problemTop + 60, w: 140, h: BUTTON_H, run: refresh };
  const controls = () => (state() ? layout().controls : problem() ? [retry] : []);
  const height = () => (state() ? layout().y : 160);

  const Pill = (props: { x: number; y: number; w: number; label: string; primary?: boolean; id: string }) => (
    <>
      <Show
        when={props.primary}
        fallback={<View class="absolute border" style={{ insetL: props.x, insetT: props.y, width: props.w, height: BUTTON_H, radius: BUTTON_H / 2, borderColor: P.line, bgColor: lit(props.id) ? P.lit : "#00000000" }} />}
      >
        <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.w, height: BUTTON_H, radius: BUTTON_H / 2, bgColor: lit(props.id) ? P.ok : P.primary }} />
      </Show>
      <Text class="absolute text-xs font-bold text-center" style={{ insetL: props.x, insetT: props.y + (BUTTON_H - 15) / 2, width: props.w, textColor: props.primary ? P.onPrimary : P.text }}>
        {busy().includes(props.id) ? "Working" : props.label}
      </Text>
    </>
  );
  const lines = (list: string[]) => list.join("\n");

  const content: PageContent = {
    view: () => (
      <>
        <Show when={!state()}>
          <Text class="absolute text-base font-bold text-center" style={{ insetL: 0, insetT: problemTop, width: W, textColor: P.text }}>{problem() ? "Setup is not answering" : "Loading"}</Text>
          <Show when={problem()}>
            <Text class="absolute text-xs text-center leading-[16]" style={{ insetL: PAD, insetT: problemTop + 24, width: textW, textColor: P.muted }}>{lines(wrap(toAscii(problem()), FONT.xs, textW, 2))}</Text>
            <Pill x={retry.x} y={retry.y} w={retry.w} label="Try Again" id={retry.id} />
          </Show>
        </Show>
        <Show when={state() && layout().blocks}>
          {(blocks) => (
            <>
              <Text class="absolute text-lg font-bold" style={{ insetL: PAD, insetT: blocks().title, width: textW, textColor: P.text }}>{ellipsize(toAscii(state()!.title), FONT.lgBold, textW)}</Text>
              <Text class="absolute text-xs" style={{ insetL: PAD, insetT: blocks().status, width: textW, textColor: state()!.ready ? P.ok : P.muted }}>
                {state()!.ready ? "Set up" : stepsLeft(state()!) === 1 ? "1 step left" : `${stepsLeft(state()!)} steps left`}
              </Text>
              <Show when={blocks().prompt}>
                {(prompt) => (
                  <>
                    <View class="absolute" style={{ insetL: PAD, insetT: prompt().top, width: textW, height: prompt().h, radius: 8, bgColor: P.surface }} />
                    <View class="absolute" style={{ insetL: PAD, insetT: prompt().top, width: 3, height: prompt().h, bgColor: P.link }} />
                    <Text class="absolute text-sm font-bold leading-[18]" style={{ insetL: PAD + 12, insetT: prompt().top + 10, width: prompt().innerW, textColor: P.text }}>{lines(prompt().titleLines)}</Text>
                    <Show when={prompt().detailLines.length}>
                      <Text class="absolute text-xs leading-[16]" style={{ insetL: PAD + 12, insetT: prompt().top + 14 + prompt().titleLines.length * 18, width: prompt().innerW, textColor: P.muted }}>{lines(prompt().detailLines)}</Text>
                    </Show>
                    <Show when={state()!.prompt?.kind === "code" && state()!.prompt?.code}>
                      <Text class="absolute text-xl font-bold" style={{ insetL: PAD + 12, insetT: prompt().codeY, width: prompt().innerW, textColor: P.text }}>{toAscii(state()!.prompt!.code!)}</Text>
                    </Show>
                    <Show when={state()!.prompt?.kind === "code" && state()!.prompt?.url}>
                      <Text class="absolute text-xs" style={{ insetL: PAD + 12, insetT: prompt().urlY, width: prompt().innerW, textColor: P.link }}>{ellipsize(shownUrl(state()!.prompt!.url!), FONT.xs, prompt().innerW)}</Text>
                    </Show>
                    <Show when={prompt().qr && state()!.prompt?.url}>
                      <Qr url={() => state()!.prompt?.url ?? ""} x={PAD + textW - 10 - prompt().qr} y={prompt().top + 10} size={prompt().qr} />
                    </Show>
                  </>
                )}
              </Show>
              <For each={blocks().fields}>
                {(block) => (
                  <>
                    <Text class="absolute text-sm font-bold" style={{ insetL: PAD, insetT: block.top, width: block.innerW - 70, textColor: P.text }}>{ellipsize(toAscii(block.field.label), FONT.smBold, block.innerW - 70)}</Text>
                    <Show
                      when={block.field.set}
                      fallback={<Text class="absolute text-xs text-right" style={{ insetL: PAD + block.innerW - 70, insetT: block.top + 1, width: 70, textColor: P.muted }}>{block.field.optional ? "Optional" : "Not set"}</Text>}
                    >
                      <Text class="absolute text-xs font-bold text-right" style={{ insetL: PAD + block.innerW - 90, insetT: block.top + 1, width: 70, textColor: P.ok }}>Set</Text>
                      <Image class="absolute w-[16] h-[16]" src="art/kit/check-green.svg" style={{ insetL: PAD + block.innerW - 16, insetT: block.top }} />
                    </Show>
                    <Text class="absolute text-xs leading-[16]" style={{ insetL: PAD, insetT: block.helpY, width: block.innerW, textColor: P.muted }}>{lines(block.helpLines)}</Text>
                    <Show when={block.linkLines.length}>
                      <Text class="absolute text-xs leading-[16]" style={{ insetL: PAD, insetT: block.linkY, width: block.innerW, textColor: P.link }}>{lines(block.linkLines)}</Text>
                    </Show>
                    <Show when={block.qr && block.field.link}>
                      <Qr url={() => block.field.link?.url ?? ""} x={PAD + textW - block.qr} y={block.top} size={block.qr} />
                    </Show>
                    <View
                      class="absolute border"
                      style={{ insetL: PAD, insetT: block.entryY, width: block.entryW, height: ENTRY_H, radius: 6, bgColor: lit(`setup.field.${block.field.id}`) ? P.lit : P.surface, borderColor: options.draft(block.field.id) !== null ? P.link : P.line }}
                    />
                    <Text class="absolute text-sm" style={{ insetL: PAD + 10, insetT: block.entryY + (ENTRY_H - 17) / 2, width: block.entryW - 20, textColor: entryText(block.field, options.draft(block.field.id)) ? P.text : P.muted }}>
                      {ellipsize(entryText(block.field, options.draft(block.field.id)) || (block.field.set ? "" : `Type the ${toAscii(block.field.label)}`), FONT.sm, block.entryW - 20)}
                    </Text>
                    <Show when={block.clearW}>
                      <Pill x={PAD + block.entryW + 8} y={block.entryY} w={block.clearW} label="Clear" id={`setup.clear.${block.field.id}`} />
                    </Show>
                    <Show when={block.errorLines.length}>
                      <Text class="absolute text-xs leading-[16]" style={{ insetL: PAD, insetT: block.errorY, width: textW, textColor: P.bad }}>{lines(block.errorLines)}</Text>
                    </Show>
                  </>
                )}
              </For>
              <For each={blocks().tools}>
                {(block) => (
                  <>
                    <Text class="absolute text-sm font-bold" style={{ insetL: PAD, insetT: block.top, width: textW, textColor: P.text }}>{ellipsize(toAscii(block.tool.title), FONT.smBold, textW)}</Text>
                    <Text class="absolute text-xs" style={{ insetL: PAD, insetT: block.vendorY, width: textW, textColor: P.muted }}>{block.tool.vendor ? `From ${toAscii(block.tool.vendor)}` : " "}</Text>
                    <Show when={block.noteLines.length}>
                      <Text class="absolute text-xs leading-[16]" style={{ insetL: PAD, insetT: block.noteY, width: textW, textColor: P.muted }}>{lines(block.noteLines)}</Text>
                    </Show>
                    <Show when={block.tool.terms}>
                      <Text class="absolute text-xs" style={{ insetL: PAD, insetT: block.termsY, width: textW, textColor: P.link }}>{ellipsize(`Terms: ${shownUrl(block.tool.terms)}`, FONT.xs, textW)}</Text>
                    </Show>
                    <Text
                      class="absolute text-xs font-bold leading-[16]"
                      style={{ insetL: PAD, insetT: block.statusY, width: textW, textColor: refused()?.id === block.tool.id || block.tool.state === "failed" ? P.bad : block.tool.state === "ready" ? P.ok : P.text }}
                    >
                      {lines(block.statusLines)}
                    </Text>
                    <Show when={block.tool.state === "fetching"}>
                      <View class="absolute" style={{ insetL: PAD, insetT: block.barY, width: textW, height: 4, radius: 2, bgColor: P.raised }} />
                      <View class="absolute" style={{ insetL: PAD, insetT: block.barY, width: Math.round(textW * progressFraction(block.tool.received, block.tool.total)), height: 4, radius: 2, bgColor: P.ok }} />
                    </Show>
                    <Show when={block.action}>
                      {(action) => <Pill x={PAD} y={block.buttonY} w={block.buttonW} label={action().label} primary={block.tool.state === "absent"} id={`setup.tool.${block.tool.id}`} />}
                    </Show>
                  </>
                )}
              </For>
            </>
          )}
        </Show>
      </>
    ),
    height,
    focusOrder: () => controls().map((control) => control.id),
    targets(top, offset, bottom) {
      const out: Target[] = [];
      for (const c of controls()) {
        const y = top + c.y - offset;
        if (y + c.h <= top || y >= bottom) continue;
        out.push({ id: c.id, x: c.x, y, w: c.w, h: c.h, run: c.run });
      }
      return out;
    },
    span(id) {
      const found = controls().find((control) => control.id === id);
      return found ? [found.y, found.y + found.h] : null;
    },
    activate: (id) => controls().find((control) => control.id === id)?.run(),
  };

  return {
    title: () => options.title ?? toAscii(state()?.title ?? "Setup"),
    backLabel: "Setup",
    tint: "flat",
    ...(options.barColors ? { barColors: options.barColors } : {}),
    ...(options.inset ? { inset: options.inset } : {}),
    content,
    activateLabel: () => "Choose",
    fixed: () => <View class="absolute left-0 top-0" style={{ width: W, height: SCREEN_H, bgColor: P.bg }} />,
  };
}
