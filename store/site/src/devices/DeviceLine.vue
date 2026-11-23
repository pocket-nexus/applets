<script setup lang="ts">
// One quiet line under the front's headline: the devices the store's applets
// run on, each with how many, as the listing names them. A device scopes the
// front to it (?device=<target>), an address that can be shared; the device
// in scope is marked, and a press on it again lets it go. Until the listing
// is in, the line keeps its height empty, so the fan does not move.
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useLanguage } from "../i18n/index.ts";
import type { StoreApp } from "../api.ts";
import { devicesIn } from "./devices.ts";

const props = defineProps<{ apps: StoreApp[]; scoped?: string }>();
const { t } = useLanguage();
const route = useRoute();
const devices = computed(() => devicesIn(props.apps));

function to(target?: string) {
  const { device: _, ...rest } = route.query;
  return { query: target ? { ...rest, device: target } : rest };
}
</script>

<template>
  <nav class="line" :aria-label="t('devices.runsOn')">
    <span v-if="devices.length" class="label">{{ t("devices.runsOn") }}</span>
    <RouterLink v-for="device in devices" :key="device.target" class="device" :class="{ on: device.target === scoped }" :to="to(device.target === scoped ? undefined : device.target)" :aria-current="device.target === scoped ? 'true' : undefined">
      <span class="glyph" :style="{ aspectRatio: device.surface.join(' / ') }" aria-hidden="true" />
      {{ device.name }}
      <span class="count">{{ device.count }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 4px;
  min-height: 32px;
  margin-top: -10px;
  box-sizing: content-box;
  padding-bottom: 22px;
  font-size: 14px;
}

.label {
  margin-right: 6px;
  color: var(--text-3);
}

.device {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 6px 0 11px;
  border-radius: 999px;
  color: var(--text-2);
  font-weight: 550;
  transition: background 0.15s, color 0.15s;
}

.device:hover {
  background: var(--fill);
  color: var(--text);
}

.device.on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

/* the device's screen, at its applets' shape */
.glyph {
  height: 11px;
  border: 1.5px solid currentColor;
  border-radius: 2.5px;
  opacity: 0.8;
}

.count {
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.device.on .count {
  background: transparent;
  color: inherit;
}
</style>
