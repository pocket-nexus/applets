<script setup lang="ts">
// The front of the store: a hand of apps fanned out like cards, each one its
// first screen, with the one in front named underneath. A press on a card
// behind brings it forward; the one in front opens its page. Left alone, the
// fan turns by itself, and waits while a pointer or the keyboard is on it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLanguage } from "../i18n/index.ts";
import { RouterLink } from "vue-router";
import { appPath, iconUrl, type StoreApp } from "../api.ts";
import { shotOf } from "../shots.ts";
import AppIcon from "./AppIcon.vue";
import UiIcon from "./UiIcon.vue";

/** Cards fanned to each side of the one in front; any more wait behind, unseen. */
const REACH = 2;
/** How long a card stays in front before the next comes forward on its own. */
const TURN_MS = 6000;
/** A drag this far sideways turns the fan. */
const SWIPE = 40;

const props = defineProps<{ apps: StoreApp[] }>();
const { t } = useLanguage();

const hand = ref<HTMLElement>();
const front = ref(0);
/** The cards start as one stack and are dealt into the fan once they are on the page. */
const dealt = ref(false);
/** A pointer is over the fan or the keyboard is in it. */
const held = ref(false);
const current = computed(() => props.apps[front.value]);

/** A card's place in the fan: 0 in front, negative to its left, positive to
 *  its right, counted the short way round so the hand has two sides. */
function place(index: number): number {
  const all = props.apps.length;
  const ahead = (((index - front.value) % all) + all) % all;
  return ahead > all / 2 ? ahead - all : ahead;
}

function card(index: number) {
  const at = dealt.value ? place(index) : 0;
  return { "--o": at, "--a": Math.abs(at), zIndex: props.apps.length - Math.abs(at) };
}

const still = matchMedia("(prefers-reduced-motion: reduce)");
let turning: ReturnType<typeof setInterval> | undefined;

/** Start the wait for the next turn again. */
function wait() {
  clearInterval(turning);
  if (props.apps.length < 2 || still.matches) return;
  turning = setInterval(() => {
    if (!held.value && !document.hidden) front.value = (front.value + 1) % props.apps.length;
  }, TURN_MS);
}

async function show(index: number) {
  const all = props.apps.length;
  // the keyboard was on the card in front: it follows to the new one, and is
  // not left on a card that has gone behind
  const followed = hand.value?.contains(document.activeElement) ?? false;
  front.value = ((index % all) + all) % all;
  wait();
  if (!followed) return;
  await nextTick();
  hand.value?.querySelector<HTMLElement>(".front a")?.focus({ preventScroll: true });
}

let from: number | undefined;
let swiped = false;

function down(event: PointerEvent) {
  from = event.clientX;
  swiped = false;
}

function up(event: PointerEvent) {
  if (from === undefined) return;
  const moved = event.clientX - from;
  from = undefined;
  if (Math.abs(moved) < SWIPE) return;
  swiped = true;
  void show(front.value + (moved < 0 ? 1 : -1));
}

/** The card in front is a link to its app; one behind comes forward instead,
 *  and the press that ends a swipe does neither. */
function press(event: MouseEvent, index: number, open: (event: MouseEvent) => unknown) {
  if (swiped || index !== front.value) {
    event.preventDefault();
    if (!swiped) void show(index);
    swiped = false;
    return;
  }
  void open(event);
}

onMounted(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => (dealt.value = true)));
  wait();
});
onBeforeUnmount(() => clearInterval(turning));
watch(() => props.apps.length, () => show(0));
</script>

<template>
  <section
    class="fan" aria-roledescription="carousel" :aria-label="t('home.featured')"
    @pointerenter="held = true" @pointerleave="held = false" @focusin="held = true" @focusout="held = false"
    @keydown.left.prevent="show(front - 1)" @keydown.right.prevent="show(front + 1)"
  >
    <!-- the colours of the app in front, behind the hand -->
    <div class="glow" aria-hidden="true">
      <img v-for="(app, index) in apps" :key="app.id" :class="{ lit: index === front }" :src="iconUrl(app)" alt="" decoding="async">
    </div>

    <ul ref="hand" class="cards" @pointerdown="down" @pointerup="up" @pointercancel="from = undefined">
      <li v-for="(app, index) in apps" :key="app.id" class="card" :class="{ front: index === front, unseen: Math.abs(place(index)) > REACH }" :style="card(index)">
        <RouterLink v-slot="{ href, navigate }" :to="appPath(app)" custom>
          <a :href="href" :tabindex="index === front ? 0 : -1" :aria-hidden="index !== front" :aria-label="`${app.title}: ${app.summary}`" draggable="false" @click="press($event, index, navigate)">
            <img :src="shotOf(app.id)" alt="" width="1024" height="768" decoding="async" draggable="false">
          </a>
        </RouterLink>
      </li>
    </ul>

    <div class="caption" :aria-live="held ? 'polite' : 'off'">
      <button v-if="apps.length > 1" class="turn" type="button" :aria-label="t('common.previous')" @click="show(front - 1)"><UiIcon name="chevron-left" /></button>
      <Transition name="swap" mode="out-in">
        <RouterLink v-if="current" :key="current.id" class="now" :to="appPath(current)">
          <AppIcon :app="current" :size="52" eager />
          <span class="words">
            <strong>{{ current.title }}</strong>
            <span>{{ current.summary }}</span>
          </span>
          <span class="pill" aria-hidden="true">{{ t("common.view") }}</span>
        </RouterLink>
      </Transition>
      <button v-if="apps.length > 1" class="turn" type="button" :aria-label="t('common.next')" @click="show(front + 1)"><UiIcon name="chevron-right" /></button>
    </div>
  </section>
</template>

<style scoped>
/* The hand is drawn on a circle whose centre is far below the cards: a card
   --o places from the front sits --o times --spread round it, so its lean and
   its drop come from the one angle. Each card is --w wide. */
.fan {
  --w: min(480px, 42vw);
  --radius: calc(var(--w) * 2.7);
  --spread: 6.5deg;
  --shrink: 0.1;
  position: relative;
  isolation: isolate;
  /* the outer cards may reach into the page's margins, and no further */
  margin-inline: calc(-1 * var(--gutter));
  padding: 10px var(--gutter) 0;
  overflow-x: clip;
}

.glow {
  position: absolute;
  inset: -56px 0 40px;
  z-index: -1;
  pointer-events: none;
  mask-image: radial-gradient(closest-side, #000 40%, transparent);
}

.glow img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(1040px, 100%);
  max-width: none;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  filter: blur(80px) saturate(2);
  opacity: 0;
  transition: opacity 0.9s ease;
}

.glow img.lit {
  opacity: 0.7;
}

.cards {
  position: relative;
  height: calc(var(--w) * 0.87);
  touch-action: pan-y;
  user-select: none;
}

.card {
  --angle: calc(var(--o) * var(--spread));
  position: absolute;
  top: 0;
  left: calc(50% - var(--w) / 2);
  width: var(--w);
  aspect-ratio: 4 / 3;
  transform:
    translate(calc(sin(var(--angle)) * var(--radius)), calc((1 - cos(var(--angle))) * var(--radius) + var(--lift, 0px)))
    rotate(var(--angle))
    scale(calc(1 - var(--a) * var(--shrink)));
  transition: transform 0.7s var(--ease), opacity 0.4s ease;
  will-change: transform;
}

.card.unseen {
  opacity: 0;
  pointer-events: none;
}

.card:not(.front):hover {
  --lift: -12px;
}

.card a {
  position: relative;
  display: block;
  height: 100%;
  overflow: hidden;
  border-radius: clamp(12px, calc(var(--w) * 0.04), 20px);
  background: #0b0b10;
  box-shadow: 0 0 0 1px var(--line), 0 26px 50px -22px rgba(10, 10, 30, 0.55), 0 8px 18px -8px rgba(10, 10, 30, 0.2);
  -webkit-tap-highlight-color: transparent;
}

.card:not(.front) a {
  cursor: pointer;
}

.card a:focus-visible {
  outline-offset: 4px;
}

.card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* a card further back fades toward the page behind it */
.card a::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--bg);
  opacity: calc(var(--a) * 0.08);
  transition: opacity 0.5s ease;
  pointer-events: none;
}

.caption {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}

.turn {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-2);
  transition: background 0.15s, color 0.15s, transform 0.15s var(--ease);
}

.turn:hover {
  background: var(--fill-hover);
  color: var(--text);
}

.turn:active {
  transform: scale(0.92);
}

.now {
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(100%, 480px);
  min-height: 72px;
  padding: 10px 14px 10px 10px;
  border-radius: 22px;
  transition: background 0.15s;
}

.now:hover {
  background: var(--fill);
}

.now:hover .pill {
  background: var(--fill-hover);
}

.words {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 1px;
}

strong {
  font-size: 19px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.words span {
  font-size: 14px;
  line-height: 1.35;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swap-enter-active,
.swap-leave-active {
  transition: opacity 0.18s ease, transform 0.18s var(--ease);
}

.swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.swap-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 700px) {
  /* a bigger card in front and a tighter hand: the outer cards run off the screen */
  .fan {
    --w: 70vw;
    --radius: calc(var(--w) * 1.9);
    --spread: 7deg;
  }

  .turn {
    display: none;
  }

  .now {
    width: 100%;
  }

  /* room for the whole summary, on two lines */
  .words span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
  }
}
</style>
