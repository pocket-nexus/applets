// The words for what a package names by id: the devices its variants target,
// the services and capabilities its manifest lists, the sections of a build.
// They are read in an app's details sheet and nowhere else. A device's name is
// its own in every language; the rest are said in the visitor's (i18n/, under
// labels).
import en from "./i18n/en.ts";
import { useLanguage } from "./i18n/index.ts";

/** The device behind a variant's target id. */
const DEVICES: Record<string, string> = {
  "rg-ds-plus": "Omarchy Pocket",
  "tab5-home": "M5Stack Tab5",
  "3ds-dev": "Nintendo 3DS",
};
const DEVICE_ORDER = Object.keys(DEVICES);

export const deviceName = (target: string) => DEVICES[target] ?? target;

/** Targets in the order the store names devices, unknown ones last. */
export function byDevice<T>(items: readonly T[], target: (item: T) => string): T[] {
  const rank = (item: T) => {
    const at = DEVICE_ORDER.indexOf(target(item));
    return at < 0 ? DEVICE_ORDER.length : at;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

// An id comes out of a publisher's package, so whether the page has words for
// it is asked of the list of ids it knows, never of the id as a path.
const { services, capabilities, sections } = en.labels;
const known = <T extends object>(table: T, id: string): id is Extract<keyof T, string> => Object.hasOwn(table, id);

export function useLabels() {
  const { t } = useLanguage();
  return {
    /** What a companion service does for the app that lists it. */
    serviceRole: (id: string) => (known(services, id) ? t(`labels.services.${id}`) : t("labels.unknownService")),
    /** What a capability an applet declares lets it do (PocketJS contracts/spec/applet.ts). */
    capabilityRole(id: string) {
      const key = id.replaceAll(".", "_");
      if (known(capabilities, key)) return t(`labels.capabilities.${key}`);
      return id.startsWith("camera.") ? t("labels.camera") : t("labels.unknownCapability");
    },
    /** A build's section by name (store/src/shared.ts SECTION_NAMES). */
    sectionName: (name: string) => (known(sections, name) ? t(`labels.sections.${name}`) : name),
  };
}
