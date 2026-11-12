<script setup lang="ts">
import { RouterView } from "vue-router";
import SiteHeader from "./components/SiteHeader.vue";
import SiteFooter from "./components/SiteFooter.vue";
</script>

<template>
  <SiteHeader />
  <main>
    <!-- a page is made again for each path, and kept while its query changes -->
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.path" />
    </RouterView>
  </main>
  <SiteFooter />
</template>

<style>
#app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
  padding-bottom: 72px;
}
</style>
