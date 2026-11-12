<script setup lang="ts">
// The front of the store, or the answer to a search (?q=).
import { computed } from "vue";
import { useLanguage } from "../i18n/index.ts";
import { RouterLink, useRoute } from "vue-router";
import { listApps, type StoreApp } from "../api.ts";
import { useLoad } from "../load.ts";
import { usePage } from "../page.ts";
import { shotOf } from "../shots.ts";
import AppGrid from "../components/AppGrid.vue";
import FeaturedFan from "../components/FeaturedFan.vue";

/** How many apps the front features at once, as a fan of cards (components/FeaturedFan.vue). */
const FEATURED = 5;

const route = useRoute();
const { t } = useLanguage();
const { data: apps, error, reload } = useLoad(() => null, listApps);

const asked = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""));

/** How well an app answers one word of a search, best first: its title, the
 *  name its id ends in ("hn" for Hacker News), its summary, then the start of
 *  a word of its publisher's name. Not the whole id, and not any letters
 *  inside the publisher's name: every app of a publisher shares those, so an
 *  "x" would find everything from pocket-nexus. */
function answers(app: StoreApp, word: string): number | undefined {
  const title = app.title.toLowerCase();
  if (title.startsWith(word)) return 0;
  if (title.includes(word)) return 1;
  if (app.id.slice(app.id.lastIndexOf(".") + 1).includes(word)) return 2;
  if (app.summary.toLowerCase().includes(word)) return 3;
  if (app.author.startsWith(word) || app.author.split("-").some((part) => part.startsWith(word))) return 4;
  return undefined;
}

/** The apps that answer every word asked for, the best answers first. */
const found = computed(() => {
  const words = asked.value.toLowerCase().split(/\s+/);
  return apps.value
    ?.flatMap((app) => {
      const each = words.map((word) => answers(app, word));
      return each.includes(undefined) ? [] : [{ app, worst: Math.max(...(each as number[])) }];
    })
    .sort((a, b) => a.worst - b.worst || a.app.title.localeCompare(b.app.title))
    .map((answer) => answer.app);
});

/** The apps with a still to show, a different one in front each day. */
const featured = computed(() => {
  const shown = apps.value?.filter((app) => shotOf(app.id)) ?? [];
  const first = shown.length ? Math.floor(Date.now() / 86_400_000) % shown.length : 0;
  return [...shown.slice(first), ...shown.slice(0, first)].slice(0, FEATURED);
});

const shelves = computed(() => {
  const official = apps.value?.filter((app) => app.official) ?? [];
  const community = apps.value?.filter((app) => !app.official) ?? [];
  const all: { title: string; apps: StoreApp[] }[] = [];
  if (official.length) all.push({ title: community.length ? t("home.fromOfficial") : t("common.allApplets"), apps: official });
  if (community.length) all.push({ title: official.length ? t("home.fromCommunity") : t("common.allApplets"), apps: community });
  return all;
});

usePage(() => (asked.value ? `“${asked.value}”` : undefined));
</script>

<template>
  <div class="page">
    <div v-if="error" class="notice">
      <h1>{{ t("common.storeDown") }}</h1>
      <p>{{ t("home.listDown") }}</p>
      <button class="pill" type="button" @click="reload">{{ t("common.tryAgain") }}</button>
    </div>

    <template v-else-if="asked">
      <header class="results">
        <h1>{{ t("home.results", { query: asked }) }}</h1>
        <p v-if="found">{{ t("common.applets", found.length) }}</p>
      </header>
      <div v-if="found && !found.length" class="notice">
        <h2>{{ t("home.none") }}</h2>
        <p>{{ t("home.noneDetail", { query: asked }) }}</p>
        <RouterLink class="pill" to="/">{{ t("common.seeEvery") }}</RouterLink>
      </div>
      <AppGrid v-else :apps="found" />
    </template>

    <template v-else>
      <h1 class="intro">{{ t("home.headline") }}</h1>

      <div v-if="!apps" class="stage" aria-hidden="true"><span class="skeleton" /></div>
      <FeaturedFan v-else-if="featured.length" :apps="featured" />

      <section v-if="!apps" class="shelf" aria-busy="true">
        <div class="section-head"><h2>{{ t("common.allApplets") }}</h2></div>
        <AppGrid :waiting="9" />
      </section>
      <section v-for="shelf in shelves" :key="shelf.title" class="shelf">
        <div class="section-head">
          <h2>{{ shelf.title }}</h2>
          <span class="aside">{{ t("common.applets", shelf.apps.length) }}</span>
        </div>
        <AppGrid :apps="shelf.apps" />
      </section>
      <div v-if="apps && !apps.length" class="notice">
        <h2>{{ t("home.empty") }}</h2>
      </div>
    </template>
  </div>
</template>

<style scoped>
.intro,
.results h1 {
  font-size: clamp(30px, 4.4vw, 40px);
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: -0.035em;
}

/* what the store is, said once, over the fan it is centred on */
.intro {
  padding: 40px 0 26px;
  text-align: center;
  text-wrap: balance;
}

.results {
  padding: 36px 0 14px;
}

.results h1 {
  overflow-wrap: anywhere;
}

.results p {
  margin-top: 6px;
  color: var(--text-3);
}

/* the room the fan of featured apps will take (components/FeaturedFan.vue), and its front card */
.stage {
  --w: min(480px, 42vw);
  height: calc(var(--w) * 0.87 + 86px);
  padding-top: 10px;
}

.stage .skeleton {
  display: block;
  width: var(--w);
  aspect-ratio: 4 / 3;
  margin: 0 auto;
  border-radius: clamp(12px, calc(var(--w) * 0.04), 20px);
}

.shelf {
  margin-top: 44px;
}

@media (max-width: 700px) {
  .stage {
    --w: 70vw;
  }
}

@media (max-width: 760px) {
  .intro {
    padding: 28px 0 20px;
  }
}
</style>
