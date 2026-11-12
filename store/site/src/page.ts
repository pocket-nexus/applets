import { toValue, watchEffect, type MaybeRefOrGetter } from "vue";

const SITE = "Pocket Applets";
const ABOUT = document.querySelector('meta[name="description"]');
const DEFAULT_ABOUT = ABOUT?.getAttribute("content") ?? "";

/** The tab's title and the page's description, for as long as they change. */
export function usePage(title?: MaybeRefOrGetter<string | undefined>, about?: MaybeRefOrGetter<string | undefined>) {
  watchEffect(() => {
    const name = toValue(title);
    document.title = name ? `${name} · ${SITE}` : SITE;
    ABOUT?.setAttribute("content", toValue(about) || DEFAULT_ABOUT);
  });
}
