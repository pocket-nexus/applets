// What sits one level under an app's page: everything a package says about
// itself that a visitor does not need in order to want the app. The page
// opens these from its "more" menu, as ?details=<section>.
import type { Glyph } from "./components/UiIcon.vue";

export const SECTIONS = [
  { id: "compatibility", label: "Compatibility", glyph: "device" },
  { id: "access", label: "Access", glyph: "shield" },
  { id: "versions", label: "Versions", glyph: "history" },
  { id: "package", label: "Package", glyph: "box" },
] as const satisfies readonly { id: string; label: string; glyph: Glyph }[];

export type Section = (typeof SECTIONS)[number]["id"];

export const sectionOf = (query: unknown): Section | undefined => SECTIONS.find((section) => section.id === query)?.id;
