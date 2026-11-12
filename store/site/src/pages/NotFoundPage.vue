<script setup lang="ts">
import { useLanguage } from "../i18n/index.ts";
import { RouterLink } from "vue-router";
import { usePage } from "../page.ts";

const { t } = useLanguage();
usePage(() => t("missing.title"));
</script>

<template>
  <div class="page">
    <div class="notice">
      <h1>{{ t("missing.heading") }}</h1>
      <p>{{ t("missing.detail") }}</p>
      <RouterLink class="pill" to="/">{{ t("common.seeEvery") }}</RouterLink>
    </div>
  </div>
</template>
