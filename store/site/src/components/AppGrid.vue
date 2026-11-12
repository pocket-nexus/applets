<script setup lang="ts">
// Apps in columns of rows, or the shape of them while the store answers.
import type { StoreApp } from "../api.ts";
import AppRow from "./AppRow.vue";

defineProps<{ apps?: StoreApp[]; waiting?: number }>();
</script>

<template>
  <ul v-if="apps" class="grid">
    <li v-for="app in apps" :key="app.id"><AppRow :app="app" /></li>
  </ul>
  <div v-else class="grid" aria-hidden="true">
    <div v-for="n in waiting ?? 6" :key="n" class="ghost">
      <span class="skeleton icon" />
      <span class="lines"><span class="skeleton" /><span class="skeleton" /></span>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
  column-gap: 36px;
}

.ghost {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 84px;
}

.icon {
  flex: none;
  width: 60px;
  height: 60px;
  border-radius: 14px;
}

.lines {
  flex: 1;
  display: grid;
  gap: 8px;
}

.lines .skeleton {
  height: 12px;
  width: 45%;
}

.lines .skeleton + .skeleton {
  width: 80%;
}
</style>
