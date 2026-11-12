<script setup lang="ts">
// An app's own colours as a backdrop: its icon, blown up and blurred until
// only the colour is left, under a shade that keeps white text readable.
import { iconUrl, type StoreApp } from "../api.ts";

defineProps<{ app: StoreApp }>();
</script>

<template>
  <span class="ambient" aria-hidden="true"><img :src="iconUrl(app)" alt="" decoding="async"></span>
</template>

<style scoped>
.ambient {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: #1a1a22;
}

.ambient img {
  position: absolute;
  inset: -25%;
  width: 150%;
  height: 150%;
  max-width: none;
  object-fit: cover;
  filter: blur(56px) saturate(1.9);
}

.ambient::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, rgba(10, 10, 22, 0.66) 0%, rgba(10, 10, 22, 0.42) 55%, rgba(10, 10, 22, 0.28) 100%);
}
</style>
