<script setup lang="ts">
// An app running in the page, on its version's sample data. The package's own
// code runs in a sandboxed frame (/play/, store/play/player.ts) that has no
// origin and no network: this page posts it the package, the sample data and
// PocketJS's core, and hears back what the app asked for. Every request is
// answered from the sample data, so nothing here reaches a device or an account.
import { onBeforeUnmount, ref } from "vue";
import { useLanguage } from "../i18n/index.ts";
import { packageUrl, type StoreApp } from "../api.ts";
import { shotOf } from "../shots.ts";
import AmbientBackdrop from "./AmbientBackdrop.vue";
import AppIcon from "./AppIcon.vue";
import UiIcon from "./UiIcon.vue";

/** The variant the player runs: Omarchy Pocket's surface, 512 x 384 points at density 2. */
const TARGET = "rg-ds-plus";
const SURFACE = [512, 384];
/** The newest requests the list keeps. */
const KEPT = 200;

interface Asked {
  n: number;
  line: string;
  status?: number;
  /** What answered it ("route" is the sample data's own answer), or nothing when the sample data has none. */
  answer?: string;
}

/** What the frame posts (store/play/player.ts). */
interface Heard {
  type?: "ready" | "running" | "request" | "error";
  message?: string;
  method?: string;
  url?: string;
  status?: number;
  answer?: string;
}

const props = defineProps<{ app: StoreApp }>();
const { t } = useLanguage();

const state = ref<"still" | "starting" | "running" | "failed">("still");
/** Why it failed: the store sent no package, or the app stopped and said this. */
const problem = ref<{ stopped?: string }>({});
/** Each start makes a new frame. */
const run = ref(0);
const frame = ref<HTMLIFrameElement>();
const asked = ref<Asked[]>([]);
const total = ref(0);
const listed = ref(false);
const shot = shotOf(props.app.id);

const bytes = (url: string) => fetch(url).then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(String(answer.status)))));

function fail(why: { stopped?: string } = {}) {
  problem.value = why;
  state.value = "failed";
}

async function hear(event: MessageEvent<Heard | null>) {
  const to = frame.value?.contentWindow;
  if (!to || event.source !== to) return;
  const heard = event.data ?? {};
  if (heard.type === "ready") {
    try {
      const [pkg, wasm, mock] = await Promise.all([
        bytes(packageUrl(props.app)),
        bytes("/play/pocketjs.wasm"),
        fetch(`/v1/mocks/${props.app.mock}`).then((answer) => (answer.ok ? answer.json() : Promise.reject(new Error(String(answer.status))))),
      ]);
      // stopped, or started again, while they loaded
      if (frame.value?.contentWindow !== to) return;
      to.postMessage({ type: "boot", package: pkg, wasm, mock, size: SURFACE, target: TARGET }, "*", [pkg, wasm]);
    } catch {
      fail();
    }
  } else if (heard.type === "running") {
    state.value = "running";
  } else if (heard.type === "error") {
    fail({ stopped: heard.message ?? "" });
  } else if (heard.type === "request") {
    total.value++;
    asked.value.push({ n: total.value, line: `${heard.method} ${heard.url}`, status: heard.status, answer: heard.answer });
    if (asked.value.length > KEPT) asked.value.shift();
  }
}

function start() {
  asked.value = [];
  total.value = 0;
  run.value++;
  state.value = "starting";
  addEventListener("message", hear);
}

function stop() {
  removeEventListener("message", hear);
  listed.value = false;
  state.value = "still";
}

/** The app's Back, as the device's button gives it. */
function back() {
  frame.value?.contentWindow?.postMessage({ type: "button", name: "back" }, "*");
}

onBeforeUnmount(() => removeEventListener("message", hear));
</script>

<template>
  <figure class="player">
    <div class="screen">
      <button v-if="state === 'still'" class="poster" type="button" @click="start">
        <img v-if="shot" class="shot" :src="shot" :alt="t('player.firstScreen', { title: app.title })" width="1024" height="768" decoding="async">
        <template v-else>
          <AmbientBackdrop :app="app" />
          <AppIcon :app="app" :size="96" eager />
        </template>
        <span class="try"><UiIcon name="play" :size="16" />{{ t("player.try") }}</span>
      </button>
      <template v-else>
        <iframe :key="run" ref="frame" sandbox="allow-scripts" src="/play/" allow="" :title="t('player.running', { title: app.title })" />
        <div v-if="state === 'starting'" class="veil"><span class="spinner" />{{ t("player.starting", { title: app.title }) }}</div>
        <div v-else-if="state === 'failed'" class="veil" role="alert">
          <p>{{ problem.stopped === undefined ? t("player.notSent") : t("player.stopped", { message: problem.stopped }) }}</p>
          <button class="again" type="button" @click="start">{{ t("player.startAgain") }}</button>
        </div>
      </template>
    </div>

    <!-- what sits under the screen is one block, so a page can lay the screen out on its own -->
    <figcaption class="under">
      <p v-if="state === 'still'" class="note">{{ t("player.note") }}</p>
      <template v-else>
        <div class="controls">
          <button class="pill" type="button" :disabled="state !== 'running'" @click="back"><UiIcon name="chevron-left" :size="16" />{{ t("player.back") }}</button>
          <button class="pill" type="button" @click="start"><UiIcon name="restart" :size="15" />{{ t("player.restart") }}</button>
          <button class="pill" type="button" @click="stop"><UiIcon name="stop" :size="15" />{{ t("player.stop") }}</button>
          <button class="pill log" type="button" :aria-expanded="listed" @click="listed = !listed">{{ t("player.requests") }}<span>{{ total }}</span></button>
        </div>
        <p v-if="!listed" class="note">{{ t("player.hint") }}</p>
        <div v-else class="requests">
          <p>{{ t("player.requestsNote") }}</p>
          <ol v-if="asked.length">
            <li v-for="request in asked" :key="request.n" :class="{ unanswered: !request.answer }">
              <span>{{ request.line }}</span><em>{{ request.answer ? `${request.status} · ${request.answer === "route" ? t("player.sample") : request.answer}` : t("player.unanswered") }}</em>
            </li>
          </ol>
        </div>
      </template>
    </figcaption>
  </figure>
</template>

<style scoped>
.player {
  display: grid;
  gap: 12px;
}

.under {
  display: grid;
  align-content: start;
  gap: 12px;
}

.screen {
  position: relative;
  isolation: isolate;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 20px;
  background: #0b0b10;
  box-shadow: var(--shadow-screen);
}

.poster {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
}

.shot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s var(--ease);
}

.poster:hover .shot {
  transform: scale(1.015);
}

.poster:focus-visible {
  outline-offset: -4px;
  border-radius: 20px;
}

.try {
  position: absolute;
  left: 50%;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 20px 0 16px;
  border-radius: 999px;
  background: rgba(22, 22, 30, 0.82);
  backdrop-filter: saturate(1.6) blur(14px);
  -webkit-backdrop-filter: saturate(1.6) blur(14px);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 10px 26px -6px rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  transform: translateX(-50%);
  transition: transform 0.2s var(--ease), background 0.2s;
}

.poster:hover .try {
  background: var(--accent);
  transform: translateX(-50%) scale(1.04);
}

iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  padding: 24px;
  background: rgba(11, 11, 16, 0.86);
  color: rgba(255, 255, 255, 0.86);
  font-size: 15px;
  text-align: center;
}

.veil p {
  max-width: 30em;
  overflow-wrap: anywhere;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid rgba(255, 255, 255, 0.22);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

.again {
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  background: #fff;
  color: #15151a;
  font-size: 14.5px;
  font-weight: 600;
}

.note {
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-3);
  text-align: center;
  text-wrap: balance;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.controls .pill {
  color: var(--text);
  font-weight: 550;
  padding: 0 14px 0 11px;
}

.controls .log {
  margin-left: auto;
  padding: 0 8px 0 14px;
}

.log span {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--fill-hover);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.log[aria-expanded="true"] {
  background: var(--text);
  color: var(--bg);
}

.requests p {
  font-size: 13px;
  color: var(--text-3);
}

.requests ol {
  max-height: 220px;
  margin-top: 10px;
  padding: 10px 14px;
  overflow: auto;
  border-radius: 12px;
  background: var(--sunken);
  font: 12px/1.5 var(--mono);
}

.requests li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0;
}

.requests li span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.requests em {
  flex: none;
  font-style: normal;
  color: var(--text-3);
}

.requests .unanswered,
.requests .unanswered em {
  color: var(--danger);
}
</style>
