// What sits one level under an app's page: everything a package says about
// itself that a visitor does not need in order to want the app. The page
// opens these from its "more" menu, as ?details=<section>; each is named in
// the visitor's language by details.sections.<id> (i18n/).
import type { Glyph } from "./components/UiIcon.vue";

export const SECTIONS = [
  { id: "compatibility", glyph: "device" },
  { id: "access", glyph: "shield" },
  { id: "versions", glyph: "history" },
  { id: "package", glyph: "box" },
] as const satisfies readonly { id: string; glyph: Glyph }[];

export type Section = (typeof SECTIONS)[number]["id"];

export const sectionOf = (query: unknown): Section | undefined => SECTIONS.find((section) => section.id === query)?.id;
