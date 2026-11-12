import { toValue, watchEffect, type MaybeRefOrGetter } from "vue";
import { t } from "./i18n/index.ts";

const ABOUT = document.querySelector('meta[name="description"]');

/** The tab's title and the page's description, for as long as they change:
 *  with the page, and with the language. */
export function usePage(title?: MaybeRefOrGetter<string | undefined>, about?: MaybeRefOrGetter<string | undefined>) {
  watchEffect(() => {
    const name = toValue(title);
    document.title = name ? `${name} · ${t("site.name")}` : t("site.name");
    ABOUT?.setAttribute("content", toValue(about) || t("site.about"));
  });
}
