// SPDX-License-Identifier: GPL-3.0-or-later
// Bundle one of the applets for the sim: Pocket Shell's 3DS build
// (devices/3ds/build.ts) with --pocket-only, the applet's resolved plan and
// this repository as the project root.

import { join, resolve } from "node:path";
import { writePlan } from "../tools/apps.ts";
import { POCKET_SHELL, ROOT } from "../tools/paths.ts";

/** Build `app` into `out`; returns the guest's path without extension. */
export async function buildGuest(app: string, out: string): Promise<string> {
  const plan = await writePlan(app);
  const build = Bun.spawnSync(
    [
      process.execPath,
      resolve(POCKET_SHELL, "devices/3ds/build.ts"),
      `--plan=${plan.path}`,
      `--project-root=${ROOT}`,
      "--pocket-only",
      `--outdir=${join(out, "guest")}`,
      `--package-outdir=${out}`,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) throw new Error(`${app} build failed\n${build.stdout}${build.stderr}`);
  return join(out, "guest", plan.output);
}
