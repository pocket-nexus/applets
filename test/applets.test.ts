// SPDX-License-Identifier: GPL-3.0-or-later
// test/applets.test.ts — every program here is a Pocket Applet (PocketJS
// docs/APPLETS.md) and meets the applet rules: the manifest rules and the
// source rules over its import graph. The bundle budgets run when each applet
// builds. An applet's network is the worker in lib/net-worker.ts, which every
// applet with net.http declares alike.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkApplet, formatAppletDiagnostics } from "../vendor/pocketjs/tools/applet-check.ts";
import { APPS, appContract } from "../tools/apps.ts";
import { ROOT } from "../tools/paths.ts";
import { NET_WORKER } from "../lib/net-wire.ts";


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

  test("an applet's package icon is a 128 px PNG", () => {
    for (const app of APPS) {
      const icon = (JSON.parse(readFileSync(appContract(app), "utf8")) as { icon?: string }).icon;
      if (!icon) continue;
      const png = readFileSync(resolve(ROOT, app, icon));
      expect([app, png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([app, 128, 128]);
    }
  });

  for (const app of APPS) {
    test(`${app} meets the applet rules`, () => {
      const diagnostics = checkApplet({ manifestPath: appContract(app), projectRoot: ROOT });
      if (diagnostics.length > 0) throw new Error(formatAppletDiagnostics(app, diagnostics));
    });
  }
});
