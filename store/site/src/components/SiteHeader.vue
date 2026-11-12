<script setup lang="ts">
// The bar every page keeps: the way home, the search and the language. A
// search is the home page's ?q=, so the address holds it. The field searches once the typing
// pauses, not at every letter: each search redraws the page under the visitor,
// and the first letter of a word is not what they are looking for.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { LOCALES, chooseLocale, useLanguage, type Locale } from "../i18n/index.ts";
import MenuButton, { type MenuItem } from "./MenuButton.vue";
import UiIcon from "./UiIcon.vue";

const route = useRoute();
const router = useRouter();
const { t, locale } = useLanguage();

/** The languages, each under its own name, the one in use ticked. */
const languages = computed<MenuItem[]>(() => LOCALES.map(({ id, name }) => ({ id, label: name, checked: id === locale.value })));
const spoken = computed(() => LOCALES.find(({ id }) => id === locale.value)?.short);
/** How long the typing has to rest before the field searches. */
const PAUSE_MS = 250;

const field = ref<HTMLInputElement>();
const text = ref("");
/** Searches this field has sent that the address has not caught up with yet. */
let sending = 0;
/** The search that runs when the typing rests. */
let resting: ReturnType<typeof setTimeout> | undefined;

// When the visitor goes somewhere by another way (Back, a link), a search
// still waiting on their typing is dropped, so it cannot pull them back, and
// the field shows the search of the page they are now on. The field's own
// searches change nothing here: one landing late would put back letters the
// visitor has typed past.
watch(() => route.fullPath, () => {
  if (sending) return;
  clearTimeout(resting);
  const asked = typeof route.query.q === "string" ? route.query.q : "";
  if (asked !== text.value.trim()) text.value = asked;
}, { immediate: true });

/** Search for what the field holds, now. */
function search() {
  clearTimeout(resting);
  const q = (field.value?.value ?? text.value).trim();
  const to = { name: "home", query: q ? { q } : {} };
  if (route.name !== "home" && !q) return;
  sending++;
  // refining a search does not leave a page in the history for each step
  void (route.name === "home" ? router.replace(to) : router.push(to)).finally(() => sending--);
}

/** The field changed: search when the typing rests. An emptied field is not
 *  typing towards anything, so the page goes back to the front at once. */
function typed(event: Event) {
  // an input method is still composing: what is in the field is not the word yet
  if ((event as InputEvent).isComposing) return;
  if (!(event.target as HTMLInputElement).value.trim()) return search();
  clearTimeout(resting);
  resting = setTimeout(search, PAUSE_MS);
}

function clear() {
  text.value = "";
  if (field.value) field.value.value = "";
  search();
  field.value?.blur();
}

/** "/" anywhere outside a field starts a search. */
function shortcut(event: KeyboardEvent) {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable], dialog")) return;
  event.preventDefault();
  field.value?.focus();
}
onMounted(() => addEventListener("keydown", shortcut));
onBeforeUnmount(() => {
  removeEventListener("keydown", shortcut);
  clearTimeout(resting);
});
</script>

<template>
  <header class="bar">
    <div class="inner">
      <RouterLink class="logo" to="/" :aria-label="t('site.home')">
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="logo-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#7a4bd6" /><stop offset=".55" stop-color="#ff6f91" /><stop offset="1" stop-color="#ffc46b" />
            </linearGradient>
          </defs>
          <rect x="10" y="3" width="44" height="28" rx="6" fill="#23242c" /><rect x="15" y="7" width="34" height="20" rx="2" fill="url(#logo-sky)" />
          <rect x="10" y="33" width="44" height="28" rx="6" fill="#23242c" /><rect x="15" y="37" width="34" height="20" rx="2" fill="#0d0e14" />
          <g fill="#8e99c9"><rect x="18" y="44" width="28" height="3" rx="1" /><rect x="21" y="49" width="22" height="3" rx="1" /></g>
        </svg>
        <span>Pocket <em>Applets</em></span>
      </RouterLink>
      <form class="search" role="search" @submit.prevent="search">
        <UiIcon name="search" :size="17" />
        <input ref="field" v-model="text" type="search" :placeholder="t('search.placeholder')" :aria-label="t('search.label')" autocomplete="off" spellcheck="false" enterkeyhint="search" @input="typed" @compositionend="typed" @keydown.esc="clear">
        <kbd aria-hidden="true">/</kbd>
      </form>
      <MenuButton class="language" small :label="t('language')" :items="languages" @choose="chooseLocale($event as Locale)">
        <UiIcon name="globe" :size="17" />{{ spoken }}
      </MenuButton>
    </div>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--header);
  backdrop-filter: saturate(1.8) blur(20px);
  -webkit-backdrop-filter: saturate(1.8) blur(20px);
  border-bottom: 1px solid var(--line-soft);
}

.inner {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(var(--page) + 2 * var(--gutter));
  min-height: var(--header-height);
  margin: 0 auto;
  padding: 0 var(--gutter);
}

.logo {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-right: auto;
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.logo svg {
  border-radius: 4px;
}

.logo em {
  font-style: normal;
  font-weight: 500;
  color: var(--text-2);
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  width: min(100%, 260px);
  color: var(--text-3);
}

.search .glyph {
  position: absolute;
  left: 11px;
  pointer-events: none;
}

.search input {
  width: 100%;
  height: 36px;
  padding: 0 34px 0 35px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--fill);
  color: var(--text);
  font-size: 15px;
  outline: none;
  appearance: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.search input::placeholder {
  color: var(--text-3);
}

.search input:hover {
  background: var(--fill-hover);
}

.search input:focus {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.search input::-webkit-search-cancel-button {
  appearance: none;
}

kbd {
  position: absolute;
  right: 9px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--line);
  border-radius: 5px;
  font: 500 11px/1 var(--font);
  color: var(--text-3);
  pointer-events: none;
}

.search input:focus ~ kbd,
.search input:not(:placeholder-shown) ~ kbd {
  display: none;
}

@media (max-width: 720px) {
  .inner {
    flex-wrap: wrap;
    gap: 0 12px;
    padding-top: 10px;
    padding-bottom: 12px;
  }

  .logo {
    min-height: 40px;
  }

  /* the language beside the name, the search on a line of its own under both */
  .search {
    order: 1;
    width: 100%;
    margin-top: 6px;
  }

  .search input {
    height: 40px;
    font-size: 16px;
  }

  kbd {
    display: none;
  }
}
</style>
