// The website's languages. A visitor gets the first of their browser's
// languages the site speaks, English when it speaks none of them, and the one
// they pick from the header from then on.
//
// To add a language: a file here shaped like en.ts (the Wording type holds it
// to that), and a line in LOCALES and in the two tables given to createI18n.
import { watch } from "vue";
import { createI18n, useI18n } from "vue-i18n";
import en from "./en.ts";
import zhCN from "./zh-CN.ts";

/** What every language's file must hold: en.ts's keys, each with a message. */
export type Wording = Shape<typeof en>;
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

/** The languages, each by its own name for itself. */
export const LOCALES = [
  { id: "en", name: "English", short: "EN" },
  { id: "zh-CN", name: "简体中文", short: "中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

const FALLBACK: Locale = "en";
/** Where a visitor's own choice is kept. */
const CHOICE = "locale";

const speaks = (id: unknown): id is Locale => LOCALES.some((locale) => locale.id === id);

/** What the visitor chose before, when they did and the browser still holds it. */
function chosen(): Locale | undefined {
  try {
    const kept = localStorage.getItem(CHOICE);
    return speaks(kept) ? kept : undefined;
  } catch {
    return undefined;
  }
}

/** The first of the browser's languages the site speaks: its exact name, or
 *  the one language it shares (zh-TW reads zh-CN sooner than English). */
function preferred(): Locale {
  for (const wanted of navigator.languages ?? [navigator.language]) {
    if (speaks(wanted)) return wanted;
    const language = wanted.split("-")[0];
    const near = LOCALES.find((locale) => locale.id.split("-")[0] === language);
    if (near) return near.id;
  }
  return FALLBACK;
}

/** A date: "Nov 3, 2026", "2026年11月3日". */
const day = { year: "numeric", month: "short", day: "numeric" } as const;

export const i18n = createI18n({
  legacy: false,
  locale: chosen() ?? preferred(),
  fallbackLocale: FALLBACK,
  messages: { en, "zh-CN": zhCN },
  datetimeFormats: { en: { day }, "zh-CN": { day } },
});

// the page says which language it is in, to a screen reader and to the browser
watch(i18n.global.locale, (locale) => (document.documentElement.lang = locale), { immediate: true });

/** The visitor picks a language: the page changes now, and stays that way. */
export function chooseLocale(locale: Locale) {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(CHOICE, locale);
  } catch {
    // a browser that keeps nothing: the choice lasts the visit
  }
}

// vue-i18n takes any string for a key and anything for its values, and draws
// a key it does not know as the key itself. These types hold a page to the
// messages en.ts has: a key must be one of them, and must be given exactly the
// values its message names, or a count when the message is "one | many".

/** Every message's key: "home.headline", "details.sections.access". */
export type MessageKey = Keys<typeof en>;
type Keys<T, Under extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Under}${K}` : Keys<T[K], `${Under}${K}.`>;
}[keyof T & string];

type MessageAt<T, Key extends string> = Key extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T ? MessageAt<T[Head], Rest> : never
  : Key extends keyof T ? T[Key] : never;
/** The names a message takes values for: "query" in "Results for “{query}”". */
type Named<Message> = Message extends `${string}{${infer Name}}${infer Rest}` ? Name | Named<Rest> : never;
type Given<Message> = Message extends `${string} | ${string}`
  ? [count: number]
  : [Named<Message>] extends [never] ? [] : [values: Record<Named<Message>, string | number>];

export type Translate = <Key extends MessageKey>(key: Key, ...given: Given<MessageAt<typeof en, Key>>) => string;

/** The words, outside a component. */
export const t = i18n.global.t as Translate;

/** The words and the dates of the visitor's language, in a component. */
export function useLanguage() {
  const { t, d, locale } = useI18n();
  return { t: t as Translate, day: (when: number) => d(when, "day"), locale };
}
