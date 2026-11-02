// SPDX-License-Identifier: GPL-3.0-or-later
// The applets and their resolved build plans. Every directory here with a
// pocket.app.json is an applet; its entry is relative to this repository,
// the build's project root.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPocketManifest } from "../vendor/pocketjs/framework/src/manifest/load.ts";
import { resolve3dsBuildPlan } from "../vendor/pocketjs/tools/3ds-profile.ts";
import { PLANS, ROOT } from "./paths.ts";

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

/** Resolve `app`'s app contract against the 3ds-dev host contract and write
 *  the plan the 3DS toolchain reads (the sims build with it). */
export function writePlan(app: string): { path: string; output: string } {
  const plan = resolve3dsBuildPlan(readPocketManifest(appContract(app)).manifest);
  const dir = resolve(PLANS, "3ds");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${plan.app.output}.3ds.plan.json`);
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
  return { path, output: plan.app.output };
}
