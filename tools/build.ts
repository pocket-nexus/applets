// SPDX-License-Identifier: GPL-3.0-or-later
// bun tools/build.ts [device…] [--apps a,b] — build the applets for devices,
// then one package per applet holding a variant for each device built.
//
//   omarchy-pocket  Omarchy Pocket on the Anbernic RG DS Plus: its host
//                   contract is in pocket-nexus/omarchy-pocket (host/), the
//                   checkout OMARCHY_POCKET_ROOT names, else ../omarchy-pocket
//   tab5            the M5Stack Tab5's firmware: Pocket Shell's
//                   devices/m5stack/programs/m5stack-tab5 (host id tab5-home)
//   3ds             the Nintendo 3DS: Pocket Shell's devices/3ds (host id 3ds-dev)
//
// Pocket Shell is the submodule vendor/pocket-shell (tools/paths.ts). Each
// package is compiled by its CLI (cli/pocket-shell.ts compile), which resolves
// the app contract against the device's host contract, runs its pinned
// PocketJS compiler and encodes the .pocket; the package is then checked
// against the host contract with the admission rules the device applies
// (runtime/spec/admission.ts).
//
// With no device named, every device whose host contract is at hand. A
// device's packages go to dist/<device>/<output>.pocket; dist/packages/<app>.pocket
// carries every variant built, which is what the store publishes: a device
// opens the variant for its own target. A device that does not admit an
// applet (Camera needs a camera) is left out of that applet's package.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PocketPackageVariant } from "../vendor/pocket-shell/runtime/spec/pocket-package.ts";
import { APPS, appContract, ONLY, readContract } from "./apps.ts";
import { DIST, PLANS, POCKET_SHELL, POCKET_SHELL_CLI, POCKETJS, ROOT } from "./paths.ts";

// Pocket Shell's package and admission code and its PocketJS's host contract
// reader, from the checkout POCKET_SHELL names
const { admissionHost, describeRejection, selectVariant } = await import(resolve(POCKET_SHELL, "runtime/spec/admission.ts"));
const { decodePocketPackage, encodePocketPackage } = await import(resolve(POCKET_SHELL, "runtime/spec/pocket-package.ts"));
const { hashPocketProfile, readPocketProfile } = await import(resolve(POCKETJS, "framework/src/profile.ts"));

export interface Device {
  /** The name used here, in dist/ and on the store's pages. */
  name: string;
  /** What the store calls it. */
  title: string;
  /** `pocket-shell compile` arguments that pick the device's host contract. */
  hostArgs(): string[];
  /** The host contract (pocket.host.json), for the admission check. */
  contract(): string;
  /** Why the device cannot be built here, or null. The Tab5's and the 3DS's
   *  host contracts come with Pocket Shell, so only Omarchy Pocket's can be absent. */
  missing(): string | null;
}

const OMARCHY_POCKET_ROOT = process.env.OMARCHY_POCKET_ROOT ?? resolve(ROOT, "../omarchy-pocket");
/** The Tab5 program: its host config names its host contract, tab5-home. */
const TAB5_PROGRAM = resolve(POCKET_SHELL, "devices/m5stack/programs/m5stack-tab5");
/** The 3DS host contract, 3ds-dev. Its host config (pocket.host.config.ts)
 *  also loads the recipe of the native build, which a package does not need:
 *  the contract file is the CLI's --target. */
const THREE_DS_CONTRACT = resolve(POCKET_SHELL, "devices/3ds/pocket.host.json");

const hostConfig = (config: string, name: string): Device["hostArgs"] => () => {
  if (!existsSync(config)) throw new Error(`${name}: no host config at ${config}`);
  return ["--host-config", config];
};

export const DEVICES: readonly Device[] = [
  {
    name: "omarchy-pocket",
    title: "Omarchy Pocket",
    hostArgs: hostConfig(resolve(OMARCHY_POCKET_ROOT, "host/pocket.host.config.ts"), "omarchy-pocket"),
    contract: () => resolve(OMARCHY_POCKET_ROOT, "host/pocket.host.json"),
    missing: () => (existsSync(resolve(OMARCHY_POCKET_ROOT, "host/pocket.host.config.ts")) ? null : `no omarchy-pocket checkout at ${OMARCHY_POCKET_ROOT} (set OMARCHY_POCKET_ROOT)`),
  },
  {
    name: "tab5",
    title: "M5Stack Tab5",
    hostArgs: hostConfig(resolve(TAB5_PROGRAM, "pocket.host.config.ts"), "tab5"),
    contract: () => resolve(TAB5_PROGRAM, "pocket.host.json"),
    missing: () => null,
  },
  {
    name: "3ds",
    title: "Nintendo 3DS",
    hostArgs: () => ["--target", THREE_DS_CONTRACT],
    contract: () => THREE_DS_CONTRACT,
    missing: () => null,
  },
];

/** Build `app` for `device` into dist/<device>/; the package's path, or why
 *  the device does not take it. */
export async function buildFor(device: Device, app: string): Promise<{ path: string } | { refused: string }> {
  const only = ONLY[app];
  if (only && !only.devices.includes(device.name)) return { refused: only.because };
  const contract = readContract(app);
  const outdir = resolve(DIST, device.name);
  mkdirSync(outdir, { recursive: true });
  const output = resolve(outdir, `${contract.app.output}.pocket`);
  const child = Bun.spawn(
    [
      process.execPath, POCKET_SHELL_CLI, "compile",
      "--manifest", appContract(app),
      "--project-root", ROOT,
      ...device.hostArgs(),
      "--outdir", resolve(outdir, "build"),
      "--plan-dir", resolve(PLANS, device.name),
      "--output", output,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) {
    const text = `${stdout}${stderr}`;
    // A host contract that lacks a capability the applet requires is a refusal, not a failure.
    const refusal = text.match(/(missing required capabilit[^\n]*|does not (?:provide|admit)[^\n]*|capabilit[^\n]*not (?:offered|available)[^\n]*)/i);
    if (refusal) return { refused: refusal[1]! };
    throw new Error(`${device.name} ${app}: build failed\n${text.split("\n").filter((line) => /error|Error|refus/.test(line)).slice(0, 8).join("\n") || text.slice(-1200)}`);
  }
  const profile = readPocketProfile(device.contract());
  const admission = selectVariant(decodePocketPackage(new Uint8Array(readFileSync(output))), admissionHost(profile, hashPocketProfile(profile)));
  if (!admission.ok) throw new Error(`${device.name} ${app}: the host contract does not admit ${output}: ${describeRejection(admission)}`);
  return { path: output };
}

/** One package holding every variant of `paths`; their manifests must agree. */
export function mergePackages(paths: readonly string[], output: string): void {
  const packages = paths.map((path) => decodePocketPackage(new Uint8Array(readFileSync(path))));
  const manifest = packages[0]!.manifest;
  const variants: PocketPackageVariant[] = [];
  for (const [index, pkg] of packages.entries()) {
    if (Buffer.compare(Buffer.from(pkg.manifest), Buffer.from(manifest)) !== 0) throw new Error(`${paths[index]}: its manifest differs from ${paths[0]}'s`);
    for (const variant of pkg.variants) {
      if (variants.some((kept) => kept.target === variant.target)) throw new Error(`${paths[index]}: a second variant for ${variant.target}`);
      variants.push(variant);
    }
  }
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, encodePocketPackage({ manifest, variants }));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const appsAt = args.indexOf("--apps");
  const apps = appsAt >= 0 ? args.splice(appsAt, 2)[1]!.split(",") : [...APPS];
  for (const app of apps) if (!APPS.includes(app)) throw new Error(`no applet named ${app}`);
  const named = args.length > 0 ? args : DEVICES.filter((device) => !device.missing()).map((device) => device.name);
  const devices = named.map((name) => DEVICES.find((device) => device.name === name) ?? (() => { throw new Error(`no device named ${name}: ${DEVICES.map((d) => d.name).join(", ")}`); })());
  for (const device of devices) if (device.missing()) throw new Error(device.missing()!);
  const failed: string[] = [];
  for (const app of apps) {
    const built: string[] = [];
    for (const device of devices) {
      try {
        const result = await buildFor(device, app);
        if ("path" in result) {
          built.push(result.path);
          console.log(`${app}: ${device.name} ${result.path}`);
        } else console.log(`${app}: ${device.name} does not take it (${result.refused})`);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (built.length > 0) {
      const output = resolve(DIST, "packages", `${readContract(app).app.output}.pocket`);
      mergePackages(built, output);
      console.log(`${app}: ${output} (${built.length} device${built.length === 1 ? "" : "s"})`);
    }
  }
  for (const message of failed) console.error(message);
  if (failed.length > 0) process.exit(1);
}
