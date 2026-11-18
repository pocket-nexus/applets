// SPDX-License-Identifier: GPL-3.0-or-later
// Where everything is. Pocket Shell enters as a submodule, vendor/pocket-shell:
// it holds the Applet contract, the app contract and its resolver, the .pocket
// package, the CLI that compiles an applet, the device host contracts of the
// Tab5 and the 3DS, and the kit (ui/ here is a link to its ui/). PocketJS is
// Pocket Shell's own submodule, vendor/pocket-shell/vendor/pocketjs: the CLI
// compiles with that checkout by path, so this repository names no other.
//
// A repository that carries this one as its own submodule names its Pocket
// Shell checkout in POCKET_SHELL_ROOT (relative to the working directory), and
// the tools here (setup, build, apps, icons) run from it. That checkout needs
// its own setup (`bun run setup` there). The kit link ui/, tsconfig.json and
// the tests read vendor/pocket-shell whatever the variable says.
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
/** pocket-nexus/pocket-shell. */
export const POCKET_SHELL = process.env.POCKET_SHELL_ROOT ? resolve(process.env.POCKET_SHELL_ROOT) : resolve(ROOT, "vendor/pocket-shell");
/** The PocketJS that Pocket Shell pins: the framework, the compiler, the sim's core. */
export const POCKETJS = resolve(POCKET_SHELL, "vendor/pocketjs");
/** Pocket Shell's CLI: `check` and `compile` of an app contract. */
export const POCKET_SHELL_CLI = resolve(POCKET_SHELL, "cli/pocket-shell.ts");
/** Packages, one directory per device, and the merged ones in dist/packages. */
export const DIST = resolve(ROOT, "dist");
export const PLANS = resolve(ROOT, ".pocket/plans");
