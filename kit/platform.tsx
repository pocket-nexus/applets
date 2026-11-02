// SPDX-License-Identifier: GPL-3.0-or-later
// kit/platform.tsx — what the kit takes from the device it runs on, the same
// on every device: the applet's surface (the auxiliary touch screen, or the
// whole screen on a device with one), the worker's fetch, whether the device's
// keyboard sits outside the applet's surface, and the companion's clock where
// a console's own is unset.
export { AppletSurface as Surface } from "@pocketjs/framework/applet";
export { companionService, fetch, NET_MAX_RESPONSE_BYTES } from "../lib/net.ts";
export { keyboardElsewhere } from "@pocketjs/framework/osk";
import { companionNow } from "@pocketjs/framework/link";
/** Epoch milliseconds, by the linked companion's clock when there is one. */
export const now = () => companionNow();
/** Query answers kept for going back to, within a 24 MiB guest heap. */
export const QUERIES_KEPT = 12;
