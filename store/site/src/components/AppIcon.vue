<script setup lang="ts">
// An app's icon as it was published: a 128 px PNG whose rounded corners are
// its own, so the page adds a shadow and never a mask.
import { iconUrl, type StoreApp } from "../api.ts";

withDefaults(defineProps<{ app: StoreApp; size?: number; eager?: boolean }>(), { size: 64 });
</script>

<template>
  <img class="app-icon" :src="iconUrl(app)" :width="size" :height="size" alt="" :loading="eager ? 'eager' : 'lazy'" decoding="async" draggable="false">
</template>

<style scoped>
.app-icon {
  flex: none;
  filter: var(--shadow-icon);
  user-select: none;
}
</style>
