// The devices the store's applets run on, as the listing says: every
// version's `targets`, named the way the store names them (store/src/details.ts).
// No device is named here by hand, so a device the store gains shows up on the
// front without a change to the site; one without a surface below is drawn
// at 4:3 until it has one.
//
// Each device's stills are the applets' first screens at its own surface,
// taken by `bun store/device-stills.ts <origin> <target>`; Omarchy Pocket's
// are the store's own stills (src/shots.ts), the variant its player runs.
import { computed, type Ref } from "vue";
import { useRoute } from "vue-router";
import { devicesOf } from "../../../src/details.ts";
import type { StoreApp } from "../api.ts";
import { shotOf } from "../shots.ts";

/** The surface an applet draws on, in points, by target. */
const SURFACES: Record<string, [number, number]> = {
  "rg-ds-plus": [512, 384],
  "tab5-home": [640, 360],
  "3ds-dev": [320, 240],
};

export interface ShownDevice {
  target: string;
  name: string;
  surface: [number, number];
  /** How many of the apps given run on it. */
  count: number;
}

const files = import.meta.glob<string>("./stills/*/*.webp", { eager: true, query: "?url", import: "default" });
const STILLS = new Map(Object.entries(files).map(([path, url]) => {
  const [target, file] = path.split("/").slice(-2) as [string, string];
  return [`${target}/${file.slice(0, -".webp".length)}`, url];
}));

/** An app's first screen on a device, when one was taken. */
export function stillOn(target: string, id: string): string | undefined {
  return target === "rg-ds-plus" ? shotOf(id) : STILLS.get(`${target}/${id}`);
}

export const surfaceOf = (target: string): [number, number] => SURFACES[target] ?? [4, 3];

/** The devices some app of `apps` runs on, in the store's order. */
export function devicesIn(apps: readonly StoreApp[]): ShownDevice[] {
  const targets = [...new Set(apps.flatMap((app) => app.targets))];
  return devicesOf(targets).map(({ target, name }) => ({
    target,
    name,
    surface: surfaceOf(target),
    count: apps.filter((app) => app.targets.includes(target)).length,
  }));
}

/** The device the address scopes the store to (?device=<target>), when the store has it. */
export function useScopedDevice(apps: Ref<StoreApp[] | undefined | null>) {
  const route = useRoute();
  return computed(() => {
    const asked = typeof route.query.device === "string" ? route.query.device : "";
    return asked ? devicesIn(apps.value ?? []).find((device) => device.target === asked) : undefined;
  });
}
