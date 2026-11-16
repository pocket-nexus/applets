// The words for what an app's details name by id (details.ts): the services
// and capabilities its manifest lists, the sections of a build. They are said
// in the visitor's language (i18n/, under labels). A device's name is its own
// in every language, so the details carry it themselves.
import en from "./i18n/en.ts";
import { useLanguage } from "./i18n/index.ts";

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
