<script setup lang="ts">
import { RouterLink } from "vue-router";
import { usePage } from "../page.ts";

usePage("Not here");
</script>

<template>
  <div class="page">
    <div class="notice">
      <h1>Not here.</h1>
      <p>That page is not in the store.</p>
      <RouterLink class="pill" to="/">See every applet</RouterLink>
    </div>
  </div>
</template>
