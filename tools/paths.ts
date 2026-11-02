// SPDX-License-Identifier: GPL-3.0-or-later
// Where everything is. PocketJS enters as a submodule, so every path into the
// runtime is relative to vendor/pocketjs.
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
export const VENDOR = resolve(ROOT, "vendor/pocketjs");
/** Packages, one directory per device, and the merged ones in dist/packages. */
export const DIST = resolve(ROOT, "dist");
export const PLANS = resolve(ROOT, ".pocket/plans");
