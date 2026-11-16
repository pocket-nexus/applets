// A package's details as the store reads them out of its manifest and
// directory (store/src/details.ts): the Worker answers them as /v1/details,
// and whatever shows an app draws that answer, so what is read is held here.
import { expect, test } from "bun:test";
import { detailsOf, devicesOf } from "../src/details.ts";
import type { PackageDescription, PackageVariant } from "../src/wire.ts";

const build = (target: string, hostAbi = 12): PackageVariant => ({ target, hostAbi, profile: "ab".repeat(32), hash: "0123456789abcdef", sections: [{ kind: 3, name: "js", bytes: 2048 }] });
const described = (manifest: Record<string, unknown>, targets = ["rg-ds-plus"]): PackageDescription => ({ manifest, variants: targets.map((target) => build(target)) });

test("a listing's targets name its devices, in the store's order, without their builds", () => {
  expect(devicesOf(["3ds-dev", "psp-dev", "rg-ds-plus"])).toEqual([
    { target: "rg-ds-plus", name: "Omarchy Pocket", build: undefined },
    { target: "3ds-dev", name: "Nintendo 3DS", build: undefined },
    // a device the store has no name for: its target id, after the ones it has
    { target: "psp-dev", name: "psp-dev", build: undefined },
  ]);
});

test("a package says each device's build, what it needs and uses, its surface, its framework", () => {
  const details = detailsOf(described({
    applet: { version: 1 },
    engine: { capabilities: { requires: ["input.buttons", "net.http"], enhances: ["system.agent"] } },
    app: { framework: "solid", modality: { touch: "auxiliary" }, surfaces: { auxiliary: { adaptive: { min: [320, 240], max: [640, 720] } } } },
  }, ["3ds-dev", "tab5-home", "rg-ds-plus"]));
  expect(details.devices.map((device) => [device.name, device.build?.target])).toEqual([
    ["Omarchy Pocket", "rg-ds-plus"],
    ["M5Stack Tab5", "tab5-home"],
    ["Nintendo 3DS", "3ds-dev"],
  ]);
  expect(details.devices[0]!.build).toEqual(build("rg-ds-plus"));
  expect(details.needs).toEqual(["input.buttons", "net.http"]);
  expect(details.uses).toEqual(["system.agent"]);
  expect(details.surface).toEqual({ touch: true, size: { min: [320, 240], max: [640, 720] } });
  expect(details.framework).toBe("solid");
  expect(details.api).toBe(1);
});

test("a surface is a touch one when the package says so or needs touch on it, and nothing when it names none", () => {
  const surface = (manifest: Record<string, unknown>) => detailsOf(described(manifest)).surface;
  expect(surface({ engine: { capabilities: { requires: ["input.touch.auxiliary"] } } })).toEqual({ touch: true, size: undefined });
  expect(surface({ app: { modality: { touch: "primary" } }, engine: { capabilities: { requires: ["input.touch.auxiliary"] } } })).toEqual({ touch: false, size: undefined });
  expect(surface({ app: { surfaces: { auxiliary: { adaptive: { min: [320, 240] } } } } })).toEqual({ touch: false, size: undefined });
  expect(surface({ engine: { capabilities: { requires: ["input.buttons"] } } })).toBeUndefined();
});

test("a manifest that is not shaped as one still answers details of the shape the store promises", () => {
  // a publisher wrote the manifest, and the store checks none of this at publish
  const details = detailsOf(described({
    applet: { version: "1" },
    engine: { capabilities: { requires: "net.http", enhances: ["system.agent", 7, null] } },
    app: { framework: 3, modality: "touch", surfaces: { auxiliary: { adaptive: { min: "320x240", max: [640, 720, 1] } } } },
  }));
  expect(details).toEqual({
    devices: [{ target: "rg-ds-plus", name: "Omarchy Pocket", build: build("rg-ds-plus") }],
    needs: [],
    uses: ["system.agent"],
    surface: { touch: false, size: undefined },
    framework: undefined,
    api: undefined,
  });
  expect(detailsOf(described({ app: null, engine: 5, applet: "no" }))).toMatchObject({ needs: [], uses: [], surface: undefined });
});
