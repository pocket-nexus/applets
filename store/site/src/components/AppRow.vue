<script setup lang="ts">
// An app in a list: its icon, what it is called, what it does, and the way in.
import { RouterLink } from "vue-router";
import { appPath, type StoreApp } from "../api.ts";
import AppIcon from "./AppIcon.vue";

defineProps<{ app: StoreApp }>();
</script>

<template>
  <RouterLink class="row" :to="appPath(app)">
    <AppIcon :app="app" :size="60" />
    <span class="text">
      <span class="words">
        <strong>{{ app.title }}</strong>
        <span class="summary">{{ app.summary }}</span>
      </span>
      <span class="pill" aria-hidden="true">View</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 -10px;
  padding: 0 10px;
  border-radius: 16px;
  transition: background 0.15s;
}

.row:hover {
  background: var(--fill);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 84px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-soft);
}

.row:hover .text {
  border-color: transparent;
}

.words {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

strong {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.011em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary {
  font-size: 13.5px;
  line-height: 1.35;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.row:hover .pill {
  background: var(--fill-hover);
}
</style>
