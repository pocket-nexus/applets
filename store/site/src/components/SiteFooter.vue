<script setup lang="ts">
import { Translation } from "vue-i18n";
import type { MessageKey } from "../i18n/index.ts";

/** the one message drawn by its key, so the key is checked here */
const CREDIT: MessageKey = "footer.credit";
</script>

<template>
  <footer>
    <div class="inner">
      <!-- the sentence is the language's; the two names in it are links wherever it puts them -->
      <Translation :keypath="CREDIT" tag="p" scope="global">
        <template #nexus><a href="https://pocket.nexus/">Pocket Nexus</a></template>
        <template #pocketjs><a href="https://pocketjs.dev/">PocketJS</a></template>
      </Translation>
    </div>
  </footer>
</template>

<style scoped>
footer {
  border-top: 1px solid var(--line-soft);
  font-size: 13px;
  color: var(--text-3);
}

.inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 24px;
  max-width: calc(var(--page) + 2 * var(--gutter));
  margin: 0 auto;
  padding: 22px var(--gutter) 28px;
}

a {
  color: var(--text-2);
}

a:hover {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
