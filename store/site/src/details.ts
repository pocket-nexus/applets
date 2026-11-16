// An app's details: everything a package says about itself that a visitor
// does not need in order to want the app. The store reads them out of the
// package (store/src/details.ts, answered as /v1/details); this is the one
// place the website asks for them, so whatever shows them, the sheet under an
// app's page (components/DetailsSheet.vue) or anything else, asks here.
//
// What is here is what the package says, not the words for it: a capability
// and a service are ids, said in the visitor's language by labels.ts. A
// device's name is its own in every language.
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref, type ShallowRef } from "vue";
import { devicesOf } from "../../src/details.ts";
import { listVersions, readDetails, type AppDetails, type StoreApp } from "./api.ts";
import type { Glyph } from "./components/UiIcon.vue";
import { useLoad, type Loaded } from "./load.ts";

/** The sections the details are shown in. An app's page opens its sheet at
 *  one from its "more" menu, as ?details=<section>; each is named in the
 *  visitor's language by details.sections.<id> (i18n/). */
export const SECTIONS = [
  { id: "compatibility", glyph: "device" },
  { id: "access", glyph: "shield" },
  { id: "versions", glyph: "history" },
  { id: "package", glyph: "box" },
] as const satisfies readonly { id: string; glyph: Glyph }[];

export type Section = (typeof SECTIONS)[number]["id"];

export const sectionOf = (query: unknown): Section | undefined => SECTIONS.find((section) => section.id === query)?.id;

export interface LoadedDetails {
  /** What is known so far: the devices the listing names at once, and all of
   *  the details once the store has answered them. */
  details: ComputedRef<AppDetails>;
  /** The store is being asked. */
  loading: Ref<boolean>;
  /** Why it did not answer. */
  error: ShallowRef<unknown>;
  /** Ask again, after a failure. */
  reload(): void;
}

/** An app's details, for a component that shows them. They are asked for
 *  when this is first called, once a visit however many call it (api.ts). */
export function useDetails(app: MaybeRefOrGetter<StoreApp>): LoadedDetails {
  const answered = useLoad(() => toValue(app).package, readDetails);
  return {
    details: computed(() => answered.data.value ?? { devices: devicesOf(toValue(app).targets), needs: [], uses: [] }),
    loading: answered.loading,
    error: answered.error,
    reload: answered.reload,
  };
}

/** Every listed version of an app, newest first, for a component that shows them. */
export function useVersions(app: MaybeRefOrGetter<StoreApp>): Loaded<StoreApp[]> {
  return useLoad(() => toValue(app).id, listVersions);
}
