<script setup lang="ts">
// The page's own glyphs, drawn on a 24 px grid in the text's colour.
const GLYPHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.7 2.3 2.7 14.7 0 17M12 3.5c-2.7 2.3-2.7 14.7 0 17"/>',
  "chevron-left": '<path d="m14.5 6-6 6 6 6"/>',
  "chevron-right": '<path d="m9.5 6 6 6-6 6"/>',
  more: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></g>',
  close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  verified: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m7.6 12.4 3 3 5.8-6.2" stroke="var(--on-accent)" stroke-width="2.2"/>',
  play: '<path d="M7.5 5.3v13.4a.9.9 0 0 0 1.36.77l11.2-6.7a.9.9 0 0 0 0-1.54L8.86 4.53a.9.9 0 0 0-1.36.77Z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.3h4.3"/>',
  download: '<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M13.5 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  external: '<path d="M8 16 16.5 7.5M9.5 7.5h7V14.5"/>',
  device: '<rect x="5" y="2.75" width="14" height="8.25" rx="2"/><rect x="5" y="13" width="14" height="8.25" rx="2"/>',
  shield: '<path d="M12 3 5 5.8v5.4c0 4.4 2.9 8.1 7 9.8 4.1-1.7 7-5.4 7-9.8V5.8L12 3Z"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  box: '<path d="m12 3-8 4v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4m-8 4v10"/>',
} as const;

export type Glyph = keyof typeof GLYPHS;

withDefaults(defineProps<{ name: Glyph; size?: number }>(), { size: 20 });
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html: the glyphs above, and nothing a publisher wrote -->
  <svg class="glyph" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="GLYPHS[name]" />
</template>

<style scoped>
.glyph {
  flex: none;
  display: block;
}
</style>
