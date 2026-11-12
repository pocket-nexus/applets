<script setup lang="ts">
// The way an app reaches a device: this button is a link that opens Pocket
// Hub on the app (hub.ts), and Hub does the rest. The browser follows it like
// any link to another program, asking the visitor first, and tells the page
// nothing of what came of it, so the page is only told that it was followed.
import { computed } from "vue";
import { useLanguage } from "../i18n/index.ts";
import type { StoreApp } from "../api.ts";
import { hubInstallLink } from "../hub.ts";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{ app: StoreApp }>();
defineEmits<{ follow: [] }>();
const link = computed(() => hubInstallLink(props.app));
const { t } = useLanguage();
</script>

<template>
  <a class="install" :href="link" @click="$emit('follow')">
    <UiIcon name="download" :size="22" />
    <strong>{{ t("install.withHub") }}</strong>
  </a>
</template>

<style scoped>
.install {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  min-height: 52px;
  padding: 7px 26px 7px 20px;
  border-radius: 16px;
  background: var(--accent);
  color: var(--on-accent);
  transition: background 0.15s, transform 0.15s var(--ease);
}

.install:hover {
  background: var(--accent-hover);
}

.install:active {
  transform: scale(0.98);
}

strong {
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.012em;
  white-space: nowrap;
}
</style>
