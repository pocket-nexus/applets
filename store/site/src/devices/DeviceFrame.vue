<script setup lang="ts">
// A device drawn plainly around a picture of its screen: a bezel in the
// proportions of the device's body and a screen at its applet surface's
// shape. It fills its box's width. A device the site has no drawing of gets a
// plain bezel; none of them carries a maker's mark.
import { computed } from "vue";
import { surfaceOf } from "./devices.ts";

const props = defineProps<{ target: string; src?: string; alt?: string; eager?: boolean }>();
const ratio = computed(() => surfaceOf(props.target).join(" / "));
/** The drawings the site has: the Tab5's body is M5Stack's shell, 128 x 80 mm round a 110.7 x 62.3 mm panel. */
const kind = computed(() => ({ "tab5-home": "tab5", "3ds-dev": "ds", "rg-ds-plus": "pocket" })[props.target] ?? "plain");
</script>

<template>
  <div class="frame" :class="kind" :style="{ '--ar': ratio }">
    <div class="screen">
      <img v-if="src" :src="src" :alt="alt ?? ''" :loading="eager ? 'eager' : 'lazy'" decoding="async" draggable="false">
      <slot v-else />
    </div>
  </div>
</template>

<style scoped>
.frame {
  --body: #26262d;
  position: relative;
  width: 100%;
  padding: 4.5%;
  border-radius: 5.5% / calc(5.5% * 1.3);
  background: linear-gradient(160deg, color-mix(in srgb, var(--body) 86%, #fff), var(--body) 40%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 18px 40px -18px rgba(10, 10, 30, 0.5), 0 4px 10px -4px rgba(10, 10, 30, 0.25);
}

.screen {
  position: relative;
  aspect-ratio: var(--ar);
  overflow: hidden;
  border-radius: 3px;
  background: #050507;
}

.screen img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

/* the Tab5: its bezel is the shell's, the lens above the panel */
.tab5 {
  --body: #3a3c46;
  padding: 6.9% 6.8%;
  border-radius: 3.9% / 6.25%;
}

.tab5::before {
  content: "";
  position: absolute;
  top: 2.6%;
  left: 50%;
  width: 1.7%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #121218;
  transform: translateX(-50%);
}

/* a handheld's lower half: the screen between a pad and four buttons */
.ds {
  --body: #30313a;
  padding: 5% 21%;
  border-radius: 7% / 10%;
}

.ds::before,
.ds::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 9%;
  aspect-ratio: 1;
  transform: translateY(-50%);
  opacity: 0.5;
}

.ds::before {
  left: 6%;
  background:
    linear-gradient(#0d0d12, #0d0d12) center / 34% 100% no-repeat,
    linear-gradient(#0d0d12, #0d0d12) center / 100% 34% no-repeat;
}

.ds::after {
  right: 6%;
  background:
    radial-gradient(circle at 50% 14%, #0d0d12 13%, transparent 14%),
    radial-gradient(circle at 50% 86%, #0d0d12 13%, transparent 14%),
    radial-gradient(circle at 14% 50%, #0d0d12 13%, transparent 14%),
    radial-gradient(circle at 86% 50%, #0d0d12 13%, transparent 14%);
}

.pocket {
  --body: #1f2027;
  padding: 4% 4.5%;
}
</style>
