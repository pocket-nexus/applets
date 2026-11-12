<script setup lang="ts">
// A button and the short menu under it: the "more" of an app's page, the
// languages in the header. The button shows what is put in it, three dots
// when nothing is.
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import UiIcon, { type Glyph } from "./UiIcon.vue";

export interface MenuItem {
  id: string;
  label: string;
  glyph?: Glyph;
  /** Starts a new group: a rule is drawn above it. */
  ruled?: boolean;
  /** One of a set to pick from, and whether it is the one picked. */
  checked?: boolean;
}

defineProps<{ label: string; items: MenuItem[]; small?: boolean }>();
const emit = defineEmits<{ choose: [id: string] }>();

const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const open = ref(false);
/** Hang from the trigger's right edge when it sits in the right half of the page. */
const fromRight = ref(false);

const options = () => [...(root.value?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  const box = trigger.value!.getBoundingClientRect();
  fromRight.value = box.left + box.width / 2 > innerWidth / 2;
  await nextTick();
  (options().find((option) => option.ariaChecked === "true") ?? options()[0])?.focus();
}

function close(refocus = false) {
  open.value = false;
  if (refocus) trigger.value?.focus();
}

function choose(id: string) {
  // focus goes back to the trigger first, so whatever opens next returns it there
  close(true);
  emit("choose", id);
}

function keys(event: KeyboardEvent) {
  const all = options();
  const at = all.indexOf(document.activeElement as HTMLElement);
  const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 };
  const to = moves[event.key];
  if (to !== undefined) {
    event.preventDefault();
    all[(to + all.length) % all.length]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    close(true);
  } else if (event.key === "Tab") {
    close();
  }
}

function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close();
}
watch(open, (is) => (is ? addEventListener("pointerdown", outside) : removeEventListener("pointerdown", outside)));
onBeforeUnmount(() => removeEventListener("pointerdown", outside));
</script>

<template>
  <div ref="root" class="menu-button">
    <button ref="trigger" class="trigger" :class="{ small }" type="button" aria-haspopup="menu" :aria-expanded="open" :aria-label="label" :title="label" @click="toggle">
      <slot><UiIcon name="more" :size="22" /></slot>
    </button>
    <Transition name="pop">
      <div v-if="open" class="menu" :class="{ 'from-right': fromRight }" role="menu" :aria-label="label" @keydown="keys">
        <template v-for="item in items" :key="item.id">
          <hr v-if="item.ruled">
          <button type="button" :role="item.checked === undefined ? 'menuitem' : 'menuitemradio'" :aria-checked="item.checked" tabindex="-1" @click="choose(item.id)">
            <UiIcon v-if="item.glyph" :name="item.glyph" :size="18" />
            <span>{{ item.label }}</span>
            <UiIcon v-if="item.checked" class="tick" name="check" :size="17" />
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-button {
  position: relative;
}

.trigger {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--fill);
  color: var(--text-2);
  transition: background 0.15s, color 0.15s;
}

.trigger.small {
  display: flex;
  gap: 6px;
  width: auto;
  height: 36px;
  padding: 0 11px 0 9px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 550;
  white-space: nowrap;
}

.trigger:hover,
.trigger[aria-expanded="true"] {
  background: var(--fill-hover);
  color: var(--text);
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 10;
  min-width: 232px;
  padding: 6px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  transform-origin: top left;
}

.small + .menu {
  min-width: 176px;
}

.menu.from-right {
  left: auto;
  right: 0;
  transform-origin: top right;
}

.menu button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.menu button span {
  flex: 1;
}

.menu button .glyph {
  color: var(--text-3);
}

.menu button .tick {
  color: var(--accent-ink);
}

.menu button:hover,
.menu button:focus-visible {
  outline: none;
  background: var(--fill);
}

hr {
  height: 1px;
  margin: 6px 12px;
  border: 0;
  background: var(--line-soft);
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.14s, transform 0.14s var(--ease);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
