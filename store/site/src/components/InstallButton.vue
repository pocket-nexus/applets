<script setup lang="ts">
// The way an app reaches a device: this button opens Pocket Hub, and Hub does
// the rest. Until that hand-off opens (hub.ts) the button holds its place and
// says it is not open yet.
import { computed } from "vue";
import type { StoreApp } from "../api.ts";
import { hubInstallLink } from "../hub.ts";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{ app: StoreApp }>();
const link = computed(() => hubInstallLink(props.app));
</script>

<template>
  <a v-if="link" class="install" :href="link">
    <UiIcon name="download" :size="22" />
    <span class="words"><strong>Install with Pocket Hub</strong></span>
  </a>
  <button v-else class="install" type="button" disabled>
    <UiIcon name="download" :size="22" />
    <span class="words"><small>Not open yet</small><strong>Install with Pocket Hub</strong></span>
  </button>
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
  text-align: left;
  transition: background 0.15s, transform 0.15s var(--ease);
}

a.install:hover {
  background: var(--accent-hover);
}

a.install:active {
  transform: scale(0.98);
}

.install:disabled {
  background: var(--fill);
  color: var(--text-2);
}

.install:disabled .glyph {
  color: var(--text-3);
}

.words {
  display: grid;
}

small {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

strong {
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.012em;
  white-space: nowrap;
}
</style>
