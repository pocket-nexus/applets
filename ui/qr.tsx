// SPDX-License-Identifier: GPL-3.0-or-later
// ui/qr.tsx — a QR code for a URL as one picture: the modules drawn into a
// texture of their own (kit/qr.ts encodes), white around them, sampled
// nearest; the URL in words when it does not fit a code. A sign-in page and
// the owner setup page (ui/setup.tsx) show one for a phone to open.

import { createEffect, createMemo, For, onCleanup, onMount, type Accessor } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { getOps } from "@pocketjs/framework/host";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { encodeQr } from "../kit/qr.ts";
import { FONT, wrap } from "./text.ts";

/** A QR code as one texture: a module a texel (or two), white around it,
 *  drawn with nearest sampling. Null when the text does not fit a code. */
export function qrTexture(text: string): number {
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
export function Qr(props: { url: Accessor<string>; x: number; y: number; size: number }) {
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
      <View class="absolute" style={{ insetL: props.x, insetT: props.y, width: props.size, height: props.size, radius: 8, bgColor: "#ffffff" }} />
      <Image ref={image} class="absolute" style={{ insetL: props.x + 6, insetT: props.y + 6, width: props.size - 12, height: props.size - 12 }} />
      <For each={words()}>{(line, index) => <Text class="absolute text-xs" style={{ insetL: props.x + 8, insetT: props.y + 8 + index() * 15, width: props.size - 16, textColor: "#000000" }}>{line}</Text>}</For>
    </>
  );
}

