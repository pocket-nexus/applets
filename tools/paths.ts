// SPDX-License-Identifier: GPL-3.0-or-later
// Where everything is. PocketJS enters as a submodule, vendor/pocketjs; a
// repository that carries this one as its own submodule names its PocketJS
// checkout in POCKETJS_ROOT (the same commit), and the tools build with that.
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
export const VENDOR = process.env.POCKETJS_ROOT ? resolve(process.env.POCKETJS_ROOT) : resolve(ROOT, "vendor/pocketjs");
/** Packages, one directory per device, and the merged ones in dist/packages. */
export const DIST = resolve(ROOT, "dist");
export const PLANS = resolve(ROOT, ".pocket/plans");
