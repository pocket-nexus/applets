// SPDX-License-Identifier: GPL-3.0-or-later
// bun run icons [--only notes,github] — render the icon family and bake it
// into ui/art/icons, the textures every build reads.
//
// tools/icons/icons.py models and renders each icon at 512 px in Blender into
// .pocket-build/icons/render, tools/icons/nexus.ts draws Pocket Nexus's (the
// PocketJS mark), and tools/icons/bake.ts sharpens each downsample, adds the
// shared finish (mask, gloss, rim, shadow), writes the PNGs and a contact
// sheet in .pocket-build/validation/icons. Builds use the committed PNGs and
// never need Blender. Cycles output differs a little between runs, so render
// only the icons that changed (`--only`) and review the sheet before
// committing.

import { resolve } from "node:path";
import { $ } from "bun";
import { ROOT } from "../paths.ts";

const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const out = resolve(ROOT, ".pocket-build/icons/render");
const args = process.argv.slice(2);
const at = args.indexOf("--only");
const only = at >= 0 ? (args[at + 1] ?? "").split(",").filter(Boolean) : null;

await $`${BLENDER} -b --factory-startup --python ${resolve(import.meta.dir, "icons.py")} -- --out ${out} ${args}`.cwd(ROOT);
if (!only || only.includes("nexus")) await $`bun ${resolve(import.meta.dir, "nexus.ts")} ${out}`.cwd(ROOT);
await $`bun ${resolve(import.meta.dir, "bake.ts")} ${out}`.cwd(ROOT).env({ ...process.env, ...(only ? { BAKE_ONLY: only.join(",") } : {}) });
