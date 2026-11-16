// A package's details: what its manifest and directory say about the app,
// read out for whoever shows it. This is the one place that reads them: the
// Worker answers them as /v1/details/<sha256> (index.ts), so the website and
// anything else that shows an app asks for them and parses no manifest.
import type { AppDetails, Device, PackageDescription, PackageVariant } from "./wire.ts";

/** The device behind a variant's target id, in the order the store names devices. */
const DEVICES: Record<string, string> = {
  "rg-ds-plus": "Omarchy Pocket",
  "tab5-home": "M5Stack Tab5",
  "3ds-dev": "Nintendo 3DS",
};
const DEVICE_ORDER = Object.keys(DEVICES);

/** The devices behind `targets`, in the store's order, one it has no name for
 *  last. Each has its build when the package's directory is at hand; a
 *  listing's `targets` alone name the same devices without one. */
export function devicesOf(targets: readonly string[], builds: readonly PackageVariant[] = []): Device[] {
  const rank = (target: string) => {
    const at = DEVICE_ORDER.indexOf(target);
    return at < 0 ? DEVICE_ORDER.length : at;
  };
  return [...targets]
    .sort((a, b) => rank(a) - rank(b))
    .map((target) => ({ target, name: DEVICES[target] ?? target, build: builds.find((build) => build.target === target) }));
}

/** The parts of a manifest the details are read from (PocketJS contracts/spec).
 *  A publisher wrote the manifest and the store checks none of these at
 *  publish, so each is taken only in the shape it should have. */
interface Manifest {
  app?: {
    framework?: unknown;
    modality?: { touch?: unknown };
    surfaces?: { auxiliary?: { adaptive?: { min?: unknown; max?: unknown } } };
  };
  applet?: { version?: unknown };
  engine?: { capabilities?: { requires?: unknown; enhances?: unknown } };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
/** A size as a manifest writes one: [width, height]. */
const size = (value: unknown): number[] | undefined =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number") ? (value as number[]) : undefined;

/** A package's details, out of its manifest and directory (shared.ts describePackage). */
export function detailsOf(described: PackageDescription): AppDetails {
  const manifest = described.manifest as Manifest;
  const needs = strings(manifest.engine?.capabilities?.requires);
  const adaptive = manifest.app?.surfaces?.auxiliary?.adaptive;
  const touch = manifest.app?.modality?.touch ?? (needs.includes("input.touch.auxiliary") ? "auxiliary" : undefined);
  const min = size(adaptive?.min);
  const max = size(adaptive?.max);
  const framework = manifest.app?.framework;
  const api = manifest.applet?.version;
  return {
    devices: devicesOf(described.variants.map((build) => build.target), described.variants),
    needs,
    uses: strings(manifest.engine?.capabilities?.enhances),
    surface: adaptive || touch ? { touch: touch === "auxiliary", size: min && max ? { min, max } : undefined } : undefined,
    framework: typeof framework === "string" ? framework : undefined,
    api: typeof api === "number" ? api : undefined,
  };
}
