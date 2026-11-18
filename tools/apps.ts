// SPDX-License-Identifier: GPL-3.0-or-later
// The applets and their resolved build plans. Every directory here with a
// pocket.app.json is an applet; its entry is relative to this repository,
// the build's project root.
//
// Pocket Shell's scripts import this module from an applets checkout and read
// ONLY (shells/3ds/scripts/apps.ts there), also in a checkout whose setup has
// not run: the top level reads directories and loads nothing from a
// submodule. What needs Pocket Shell's code (writePlan) imports it when called.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS, POCKET_SHELL, ROOT } from "./paths.ts";

/** `app`'s app contract. */
export function appContract(app: string): string {
  return resolve(ROOT, app, "pocket.app.json");
}

export const APPS: readonly string[] = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(appContract(entry.name)))
  .map((entry) => entry.name)
  .sort();

/** Applets built for some devices only, and why: the rest go wherever a host
 *  contract admits them. */
export const ONLY: Readonly<Record<string, { devices: readonly string[]; because: string }>> = {
  appstore: { devices: ["omarchy-pocket"], because: "its appstore service is omarchy-pocketd's; Pocket Shell installs from its paired Mac" },
  spotify: { devices: ["omarchy-pocket"], because: "its spotify service and Spotify Connect speaker run in omarchy-pocketd" },
};

export function isApp(name: string | undefined): name is string {
  return APPS.includes(name ?? "");
}

export interface AppContract {
  id: string;
  title: string;
  version: string;
  icon?: string;
  applet?: { summary?: string; services?: string[]; hosts?: string[] };
  engine: { capabilities: { requires: string[]; enhances?: string[] } };
  app: { output: string };
}

export function readContract(app: string): AppContract {
  return JSON.parse(readFileSync(appContract(app), "utf8")) as AppContract;
}

/** Resolve `app`'s app contract against the 3DS host contract (Pocket Shell's
 *  devices/3ds/pocket.host.json, host id 3ds-dev) and write the plan its 3DS
 *  build reads (the sims build with it). */
export async function writePlan(app: string): Promise<{ path: string; output: string }> {
  const { readPocketManifest } = await import(resolve(POCKET_SHELL, "runtime/manifest/load.ts"));
  const { resolve3dsBuildPlan } = await import(resolve(POCKET_SHELL, "devices/3ds/tools/profile.ts"));
  const plan = resolve3dsBuildPlan(readPocketManifest(appContract(app)).manifest);
  const dir = resolve(PLANS, "3ds");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${plan.app.output}.3ds.plan.json`);
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
  return { path, output: plan.app.output };
}
