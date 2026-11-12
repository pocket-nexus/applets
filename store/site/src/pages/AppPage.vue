<script setup lang="ts">
// One app: what it is, the button that installs it, and a look at it running.
// Nothing here says which devices it fits or what it asks of them: Pocket Hub
// settles that at install, and the curious find it one level down, in the
// details sheet the "more" menu opens (?details=<section>).
import { computed, onBeforeUnmount, ref } from "vue";
import { useLanguage } from "../i18n/index.ts";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { NotListed, authorPath, findApp, iconUrl, listApps } from "../api.ts";
import { SECTIONS, sectionOf, type Section } from "../details.ts";
import { size } from "../format.ts";
import { useLoad } from "../load.ts";
import { usePage } from "../page.ts";
import AppGrid from "../components/AppGrid.vue";
import AppIcon from "../components/AppIcon.vue";
import AppPlayer from "../components/AppPlayer.vue";
import DetailsSheet from "../components/DetailsSheet.vue";
import InstallButton from "../components/InstallButton.vue";
import MenuButton, { type MenuItem } from "../components/MenuButton.vue";
import UiIcon from "../components/UiIcon.vue";

/** How many of the publisher's other apps the page offers. */
const OTHERS = 6;

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const { t, day } = useLanguage();

const { data: app, error, reload } = useLoad(() => props.id, findApp);
const everyone = useLoad(() => null, listApps);
const others = computed(() => everyone.data.value?.filter((other) => other.author === app.value?.author && other.id !== app.value.id) ?? []);

usePage(() => app.value?.title, () => app.value?.summary);

const facts = computed(() => app.value && [
  { name: t("app.facts.version"), value: app.value.version },
  { name: t("app.facts.size"), value: size(app.value.bytes) },
  { name: t("app.facts.updated"), value: day(app.value.created) },
  { name: t("app.facts.publisher"), value: app.value.author, to: authorPath(app.value.author) },
]);

const menu = computed<MenuItem[]>(() => [
  ...SECTIONS.map(({ id, glyph }) => ({ id, glyph, label: t(`details.sections.${id}`) })),
  { id: "link", label: t("app.copyLink"), glyph: "link", ruled: true },
]);
const section = computed(() => sectionOf(route.query.details));

/** Whether this visit opened the sheet, so closing it can go back to the page under it. */
const opened = () => (history.state as { sheet?: boolean } | null)?.sheet === true;

function choose(id: string) {
  if (id === "link") return void copyLink();
  void router.push({ query: { details: id }, state: { sheet: true } });
}

function show(next: Section) {
  void router.replace({ query: { details: next }, state: { sheet: opened() } });
}

function shut() {
  if (opened()) router.back();
  else void router.replace({ query: {} });
}

const copied = ref(false);
let fading: ReturnType<typeof setTimeout> | undefined;
async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.origin + route.path);
  } catch {
    return;
  }
  copied.value = true;
  clearTimeout(fading);
  fading = setTimeout(() => (copied.value = false), 1800);
}
onBeforeUnmount(() => clearTimeout(fading));
</script>

<template>
  <div class="app-page">
    <span v-if="app" class="aura" aria-hidden="true"><img :src="iconUrl(app)" alt=""></span>
    <div class="page">
      <RouterLink class="crumb" to="/"><UiIcon name="chevron-left" :size="17" />{{ t("common.allApplets") }}</RouterLink>

      <div v-if="error instanceof NotListed" class="notice">
        <h1>{{ t("app.notListed") }}</h1>
        <p>{{ t("app.notListedDetail", { id }) }}</p>
        <RouterLink class="pill" to="/">{{ t("common.seeEvery") }}</RouterLink>
      </div>
      <div v-else-if="error" class="notice">
        <h1>{{ t("common.storeDown") }}</h1>
        <p>{{ t("app.down") }}</p>
        <button class="pill" type="button" @click="reload">{{ t("common.tryAgain") }}</button>
      </div>

      <div v-else-if="!app" class="hero" aria-busy="true">
        <div class="about">
          <span class="skeleton ghost-icon" />
          <span class="skeleton ghost-title" />
          <span class="skeleton ghost-line" />
          <span class="skeleton ghost-button" />
        </div>
        <span class="skeleton ghost-screen" />
      </div>

      <template v-else>
        <section class="hero" :class="{ alone: !app.mock }">
          <div class="about">
            <AppIcon :app="app" :size="112" eager />
            <h1>{{ app.title }}</h1>
            <p class="summary">{{ app.summary }}</p>
            <RouterLink class="author" :to="authorPath(app.author)">
              {{ app.author }}<UiIcon v-if="app.official" name="verified" :size="16" />
              <span v-if="app.official" class="visually-hidden">{{ t("app.official") }}</span>
            </RouterLink>
            <div class="actions">
              <InstallButton :app="app" />
              <MenuButton :label="t('app.more')" :items="menu" @choose="choose" />
            </div>
          </div>
          <AppPlayer v-if="app.mock" :app="app" />
        </section>

        <dl v-if="facts" class="facts">
          <div v-for="fact in facts" :key="fact.name">
            <dt>{{ fact.name }}</dt>
            <dd>
              <RouterLink v-if="fact.to" :to="fact.to">{{ fact.value }}</RouterLink>
              <template v-else>{{ fact.value }}</template>
            </dd>
          </div>
        </dl>

        <section v-if="others.length" class="others">
          <div class="section-head">
            <h2>{{ t("app.moreFrom", { author: app.author }) }}</h2>
            <RouterLink v-if="others.length > OTHERS" class="aside" :to="authorPath(app.author)">{{ t("app.seeAll") }}</RouterLink>
          </div>
          <AppGrid :apps="others.slice(0, OTHERS)" />
        </section>

        <DetailsSheet v-if="section" :app="app" :section="section" @close="shut" @show="show" />
        <Transition name="toast">
          <p v-if="copied" class="toast" role="status"><UiIcon name="check" :size="16" />{{ t("app.linkCopied") }}</p>
        </Transition>
      </template>
    </div>
  </div>
</template>

<style scoped>
.app-page {
  position: relative;
  isolation: isolate;
}

/* the app's own colours, faintly, behind the top of its page */
.aura {
  position: absolute;
  inset: 0 0 auto;
  z-index: -1;
  height: 560px;
  overflow: hidden;
  opacity: 0.2;
  pointer-events: none;
  mask-image: linear-gradient(#000, transparent);
  animation: aura-in 0.8s ease-out both;
}

.aura img {
  position: absolute;
  left: 50%;
  top: -40%;
  width: min(1400px, 130%);
  max-width: none;
  aspect-ratio: 1;
  transform: translateX(-50%);
  filter: blur(90px) saturate(1.6);
}

@keyframes aura-in {
  from {
    opacity: 0;
  }
}

.crumb {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 22px 0 0 -5px;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--text-2);
}

.crumb:hover {
  color: var(--text);
}

/* Two rows beside the app's name: the screen, and what sits under the screen.
   The name is centred on the screen alone, so nothing that opens under the
   screen (the player's controls, its list of requests) moves it. */
.hero {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(0, 560px);
  gap: 12px clamp(32px, 6vw, 72px);
  padding: 26px 0 44px;
}

.hero.alone {
  grid-template-columns: minmax(0, 1fr);
  padding-bottom: 36px;
}

.about {
  grid-area: 1 / 1;
  align-self: center;
  display: grid;
  justify-items: start;
}

.hero :deep(.player) {
  grid-area: 1 / 2 / span 2;
  grid-template-rows: subgrid;
}

.ghost-screen {
  grid-area: 1 / 2;
}

h1 {
  margin-top: 24px;
  font-size: clamp(34px, 4.8vw, 52px);
  font-weight: 750;
  line-height: 1.06;
  letter-spacing: -0.04em;
  overflow-wrap: anywhere;
}

.summary {
  max-width: 25em;
  margin-top: 12px;
  font-size: 19px;
  line-height: 1.42;
  letter-spacing: -0.012em;
  color: var(--text-2);
  text-wrap: pretty;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 14px;
  font-size: 15px;
  font-weight: 500;
  color: var(--accent-ink);
}

.author:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.author .glyph {
  color: var(--accent);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 30px;
}

.facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 20px 0;
  border-block: 1px solid var(--line-soft);
  text-align: center;
}

.facts div {
  padding: 2px 12px;
}

.facts div + div {
  border-left: 1px solid var(--line-soft);
}

.facts dt {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-3);
}

.facts dd {
  margin-top: 5px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.015em;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facts a:hover {
  color: var(--accent-ink);
}

.others {
  margin-top: 44px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px 10px 14px;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  font-size: 14.5px;
  font-weight: 550;
  box-shadow: var(--shadow-pop);
  transform: translateX(-50%);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.ghost-icon {
  width: 112px;
  height: 112px;
  border-radius: 24px;
}

.ghost-title {
  width: min(280px, 70%);
  height: 44px;
  margin-top: 26px;
}

.ghost-line {
  width: min(360px, 90%);
  height: 18px;
  margin-top: 18px;
}

.ghost-button {
  width: 250px;
  height: 52px;
  margin-top: 42px;
  border-radius: 16px;
}

.ghost-screen {
  aspect-ratio: 4 / 3;
  border-radius: 20px;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px 0 36px;
  }

  .hero :deep(.player),
  .ghost-screen {
    grid-area: auto;
    grid-template-rows: none;
  }

  /* the icon beside the name, the buttons under both */
  .about {
    grid-area: auto;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 18px;
    align-items: center;
    margin-bottom: 16px;
  }

  .about .app-icon,
  .ghost-icon {
    grid-row: 1 / span 3;
    width: 96px;
    height: 96px;
  }

  h1 {
    margin-top: 0;
    font-size: clamp(26px, 6.4vw, 34px);
    letter-spacing: -0.032em;
  }

  .summary {
    margin-top: 5px;
    font-size: 15.5px;
    line-height: 1.38;
  }

  .author {
    margin-top: 6px;
    font-size: 14px;
  }

  .actions {
    grid-column: 1 / -1;
    justify-self: stretch;
    margin-top: 22px;
  }

  .actions :deep(.install) {
    flex: 1;
    justify-content: center;
  }

  .ghost-title,
  .ghost-line {
    margin-top: 0;
  }

  .ghost-button {
    grid-column: 1 / -1;
    width: 100%;
    margin-top: 22px;
  }
}

@media (max-width: 520px) {
  .about .app-icon,
  .ghost-icon {
    width: 80px;
    height: 80px;
  }

  .facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 18px;
  }

  .facts div:nth-child(odd) {
    border-left: 0;
  }
}
</style>
