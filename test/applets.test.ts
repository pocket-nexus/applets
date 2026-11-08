// SPDX-License-Identifier: GPL-3.0-or-later
// test/applets.test.ts — every program here is a Pocket Applet (PocketJS
// docs/APPLETS.md) and meets the applet rules: the manifest rules and the
// source rules over its import graph. The bundle budgets run when each applet
// builds. An applet's network is the worker in lib/net-worker.ts, which every
// applet with net.http declares alike.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { validateAndResolveBuildPlan } from "../vendor/pocketjs/framework/src/manifest/resolve.ts";
import { checkApplet, formatAppletDiagnostics } from "../vendor/pocketjs/tools/applet-check.ts";
import { APPS, appContract } from "../tools/apps.ts";
import { ROOT } from "../tools/paths.ts";
import { NET_WORKER } from "../lib/net-wire.ts";
import { appTint } from "../ui/icons.tsx";


describe("Pocket Applets", () => {
  test("every app here declares itself an applet", () => {
    for (const app of APPS) {
      const manifest = JSON.parse(readFileSync(appContract(app), "utf8"));
      expect([app, manifest.applet !== undefined]).toEqual([app, true]);
    }
  });

  test("an applet that declares net.http fetches through the shared worker, and only then has one", () => {
    for (const app of APPS) {
      const manifest = JSON.parse(readFileSync(appContract(app), "utf8"));
      const network = [...manifest.engine.capabilities.requires, ...(manifest.engine.capabilities.enhances ?? [])].includes("net.http");
      expect([app, manifest.domains?.worker ?? null]).toEqual([app, network ? NET_WORKER : null]);
    }
  });

  // One picture per applet: icon.png (what the store lists and the package
  // carries) is a link to the family's 64@2x texture in ui/art/icons, made by
  // tools/icons, and the launcher draws the same family at 24, 46 and 64 px.
  test("every applet's icon is the family texture the launcher draws", () => {
    const icons = realpathSync(resolve(ROOT, "ui/art/icons"));
    for (const app of APPS) {
      const manifest = JSON.parse(readFileSync(appContract(app), "utf8")) as { id: string; icon?: string };
      expect([app, manifest.icon]).toEqual([app, "./icon.png"]);
      const icon = resolve(ROOT, app, "icon.png");
      expect([app, realpathSync(icon)]).toEqual([app, resolve(icons, `${app}-64@2x.png`)]);
      const png = readFileSync(icon);
      expect([app, png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([app, 128, 128]);
      expect([app, appTint(manifest.id).art]).toEqual([app, app]);
      for (const size of [24, 46, 64]) {
        for (const scale of ["", "@2x"]) {
          const texture = `${app}-${size}${scale}.png`;
          expect([texture, existsSync(resolve(icons, texture))]).toEqual([texture, true]);
        }
      }
    }
  });

  // The full-screen presentation is one screen, no touch and buttons: the
  // PSP's 480x272, read by the d-pad and the button legend (ui/legend.tsx).
  // The PSP host runs no worker (pocketjs 9a746094 took its network away), so
  // an applet with a network does not resolve there yet; nothing else may stop it.
  test("an applet with the full-screen presentation resolves for the PSP but for the network it lacks", () => {
    const presented = APPS.filter((app) => JSON.parse(readFileSync(appContract(app), "utf8")).app.presentations);
    expect(presented).toEqual(["discord", "github", "hn", "x", "youtube"]);
    for (const app of presented) {
      const resolution = validateAndResolveBuildPlan(JSON.parse(readFileSync(appContract(app), "utf8")), { target: "psp" });
      const reasons = resolution.ok ? [] : resolution.diagnostics.map((item) => item.message);
      expect([app, reasons.filter((reason) => !/does not provide (net\.http|runtime\.worker)\b/.test(reason))]).toEqual([app, []]);
    }
  });

  for (const app of APPS) {
    test(`${app} meets the applet rules`, () => {
      const diagnostics = checkApplet({ manifestPath: appContract(app), projectRoot: ROOT });
      if (diagnostics.length > 0) throw new Error(formatAppletDiagnostics(app, diagnostics));
    });
  }
});
