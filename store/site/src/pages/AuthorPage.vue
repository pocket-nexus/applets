<script setup lang="ts">
// Everything one publisher has in the store.
import { computed } from "vue";
import { useLanguage } from "../i18n/index.ts";
import { RouterLink } from "vue-router";
import { listApps } from "../api.ts";
import { useLoad } from "../load.ts";
import { usePage } from "../page.ts";
import AppGrid from "../components/AppGrid.vue";
import UiIcon from "../components/UiIcon.vue";

const props = defineProps<{ name: string }>();
const { t } = useLanguage();
const { data: apps, error, reload } = useLoad(() => null, listApps);
const theirs = computed(() => apps.value?.filter((app) => app.author === props.name));
const official = computed(() => theirs.value?.some((app) => app.official) ?? false);

usePage(() => props.name, () => t("author.about", { name: props.name }));
</script>

<template>
  <div class="page">
    <RouterLink class="crumb" to="/"><UiIcon name="chevron-left" :size="17" />{{ t("common.allApplets") }}</RouterLink>

    <div v-if="error" class="notice">
      <h1>{{ t("common.storeDown") }}</h1>
      <button class="pill" type="button" @click="reload">{{ t("common.tryAgain") }}</button>
    </div>
    <div v-else-if="theirs && !theirs.length" class="notice">
      <h1>{{ t("author.nobody") }}</h1>
      <p>{{ t("author.nobodyDetail", { name }) }}</p>
      <RouterLink class="pill" to="/">{{ t("common.seeEvery") }}</RouterLink>
    </div>
    <template v-else>
      <header class="who">
        <span class="monogram" aria-hidden="true">{{ name.slice(0, 1) }}</span>
        <div>
          <h1>{{ name }}<UiIcon v-if="official" name="verified" :size="22" /></h1>
          <p v-if="theirs">{{ official ? `${t("author.official")} · ` : "" }}{{ t("common.applets", theirs.length) }}</p>
        </div>
      </header>
      <AppGrid :apps="theirs" />
    </template>
  </div>
</template>

<style scoped>
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

.who {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 26px 0 22px;
}

.monogram {
  flex: none;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 30px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: clamp(26px, 4vw, 34px);
  font-weight: 750;
  line-height: 1.15;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

h1 .glyph {
  color: var(--accent);
}

.who p {
  margin-top: 3px;
  color: var(--text-2);
}
</style>
