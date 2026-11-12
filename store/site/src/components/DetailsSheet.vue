<script setup lang="ts">
// An app's details, one level under its page (details.ts): the devices its
// package was built for and what it asks of them, what it reaches, its
// versions, and the package itself. The package's manifest and the version
// history are read when the sheet opens, not with the page.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { listVersions, packageName, packageUrl, readManifest, type StoreApp } from "../api.ts";
import { SECTIONS, type Section } from "../details.ts";
import { day, size } from "../format.ts";
import { byDevice, capabilityRole, deviceName, sectionName, serviceRole } from "../labels.ts";
import { useLoad } from "../load.ts";
import AppIcon from "./AppIcon.vue";
import UiIcon from "./UiIcon.vue";

/** The parts of a manifest this sheet reads (PocketJS contracts/spec). */
interface Manifest {
  name?: string;
  version?: string;
  app?: {
    framework?: string;
    modality?: { touch?: string };
    surfaces?: { auxiliary?: { adaptive?: { min?: number[]; max?: number[] } } };
  };
  applet?: { version?: number };
  engine?: { capabilities?: { requires?: string[]; enhances?: string[] } };
}

const props = defineProps<{ app: StoreApp; section: Section }>();
const emit = defineEmits<{ close: []; show: [section: Section] }>();

const dialog = ref<HTMLDialogElement>();
onMounted(() => {
  dialog.value?.showModal();
  document.documentElement.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  document.documentElement.style.overflow = "";
});

/** A press on the dimmed page around the sheet closes it. */
function pressed(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close();
}

const described = useLoad(() => props.app.package, readManifest);
const history = useLoad(() => props.app.id, listVersions);

const manifest = computed(() => described.data.value?.manifest as Manifest | undefined);
const builds = computed(() => byDevice(described.data.value?.variants ?? [], (variant) => variant.target));
const devices = computed(() => byDevice(props.app.targets.length ? props.app.targets : [props.app.target], (target) => target)
  .map((target) => ({ target, name: deviceName(target), abi: builds.value.find((build) => build.target === target)?.hostAbi })));
const needs = computed(() => manifest.value?.engine?.capabilities?.requires ?? []);
const uses = computed(() => manifest.value?.engine?.capabilities?.enhances ?? []);
/** The surface the app lays itself out for, in a sentence. */
const surface = computed(() => {
  const adaptive = manifest.value?.app?.surfaces?.auxiliary?.adaptive;
  const touch = manifest.value?.app?.modality?.touch ?? (needs.value.includes("input.touch.auxiliary") ? "auxiliary" : undefined);
  if (!adaptive && !touch) return "";
  const kind = touch === "auxiliary" ? "A touch app on a surface of its own" : "It draws on the device's screen";
  return adaptive?.min && adaptive.max ? `${kind}, laid out for ${adaptive.min.join(" × ")} up to ${adaptive.max.join(" × ")} points.` : `${kind}.`;
});
const facts = computed(() => [
  ["Identifier", props.app.id],
  ["Publisher", props.app.author],
  ["Publisher key", props.app.key],
  ["SHA-256", props.app.package],
  ["Framework", manifest.value?.app?.framework],
  ["Applet API", manifest.value?.applet?.version === undefined ? undefined : `v${manifest.value.applet.version}`],
].filter((fact): fact is [string, string] => Boolean(fact[1])));
</script>

<template>
  <dialog ref="dialog" class="sheet" :aria-label="`${app.title}: details`" @close="emit('close')" @click="pressed">
    <header>
      <AppIcon :app="app" :size="40" eager />
      <div class="title">
        <strong>{{ app.title }}</strong>
        <span>Version {{ app.version }}</span>
      </div>
      <button class="shut" type="button" aria-label="Close" @click="dialog?.close()"><UiIcon name="close" :size="18" /></button>
    </header>
    <div class="tabs" role="tablist" aria-label="Details">
      <button v-for="tab in SECTIONS" :id="`tab-${tab.id}`" :key="tab.id" type="button" role="tab" :aria-selected="tab.id === section" :aria-controls="`panel-${tab.id}`" @click="emit('show', tab.id)">
        {{ tab.label }}
      </button>
    </div>

    <div :id="`panel-${section}`" :key="section" class="panel" role="tabpanel" :aria-labelledby="`tab-${section}`" tabindex="0">
      <template v-if="section === 'compatibility'">
        <p class="lede">Pocket Hub checks your device when you install. This is what the package was built for, and what it asks of a device.</p>
        <h3>Built for</h3>
        <ul class="rows">
          <li v-for="device in devices" :key="device.target">
            <span class="what">{{ device.name }}<code>{{ device.target }}</code></span>
            <span v-if="device.abi !== undefined" class="value">Host ABI {{ device.abi }}</span>
          </li>
        </ul>
        <p v-if="described.loading.value" class="quiet">Reading the package…</p>
        <p v-else-if="described.error.value" class="quiet">The package could not be read. <button class="link" type="button" @click="described.reload()">Try again</button></p>
        <template v-else>
          <template v-if="needs.length">
            <h3>Needs</h3>
            <ul class="rows">
              <li v-for="id in needs" :key="id"><span class="what">{{ capabilityRole(id) }}<code>{{ id }}</code></span></li>
            </ul>
          </template>
          <template v-if="uses.length">
            <h3>Uses where a device has it</h3>
            <ul class="rows">
              <li v-for="id in uses" :key="id"><span class="what">{{ capabilityRole(id) }}<code>{{ id }}</code></span></li>
            </ul>
          </template>
          <template v-if="surface">
            <h3>Screen</h3>
            <p class="plain">{{ surface }}</p>
          </template>
        </template>
      </template>

      <template v-else-if="section === 'access'">
        <p v-if="app.official" class="lede">Published by Pocket Nexus. It may use the services of the device it names here.</p>
        <p v-else class="lede">It can reach only what it names here. It cannot see your accounts or another app's data.</p>
        <h3>On the internet</h3>
        <ul v-if="app.hosts.length" class="rows">
          <li v-for="host in app.hosts" :key="host"><code class="host">{{ host }}</code></li>
        </ul>
        <p v-else class="plain">{{ app.official ? "It names no host of its own." : "It reaches nothing on the internet." }}</p>
        <template v-if="app.services.length">
          <h3>On the device</h3>
          <ul class="rows">
            <li v-for="service in app.services" :key="service"><span class="what">{{ serviceRole(service) }}<code>{{ service }}</code></span></li>
          </ul>
        </template>
      </template>

      <template v-else-if="section === 'versions'">
        <p v-if="history.loading.value" class="quiet">Reading the versions…</p>
        <p v-else-if="history.error.value" class="quiet">The store did not answer. <button class="link" type="button" @click="history.reload()">Try again</button></p>
        <ul v-else class="rows">
          <li v-for="(version, index) in history.data.value" :key="version.version">
            <span class="what">
              <span>Version {{ version.version }}<small v-if="index === 0" class="tag">Latest</small></span>
              <span class="sub">{{ day(version.created) }} · {{ size(version.bytes) }}</span>
            </span>
            <a class="get" :href="packageUrl(version)" :download="packageName(version)" :aria-label="`Download version ${version.version}`" title="Download the package"><UiIcon name="download" :size="18" /></a>
          </li>
        </ul>
      </template>

      <template v-else>
        <dl class="facts">
          <template v-for="[name, value] in facts" :key="name">
            <dt>{{ name }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
        <p v-if="described.loading.value" class="quiet">Reading the package…</p>
        <template v-for="build in builds" :key="build.target">
          <h3>{{ deviceName(build.target) }} build</h3>
          <ul class="rows compact">
            <li v-for="part in build.sections.filter((part) => part.name !== 'identity')" :key="part.kind">
              <span class="what">{{ sectionName(part.name) }}</span><span class="value">{{ size(part.bytes) }}</span>
            </li>
            <li><span class="what">Build hash</span><code class="value">{{ build.hash }}</code></li>
            <li><span class="what">Profile</span><code class="value">{{ build.profile.slice(0, 16) }}</code></li>
          </ul>
        </template>
        <a class="pill download" :href="packageUrl(app)" :download="packageName(app)"><UiIcon name="download" :size="17" />Download the package · {{ size(app.bytes) }}</a>
      </template>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: min(600px, 100vw - 32px);
  height: min(680px, 100dvh - 48px);
  max-width: none;
  max-height: none;
  padding: 0;
  border: 0;
  border-radius: 24px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  animation: sheet-in 0.26s var(--ease);
}

.sheet[open] {
  display: flex;
  flex-direction: column;
}

.sheet::backdrop {
  background: var(--scrim);
  animation: scrim-in 0.2s ease-out;
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
  }
}

@keyframes scrim-in {
  from {
    opacity: 0;
  }
}

header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 14px 22px;
}

.title {
  flex: 1;
  min-width: 0;
  display: grid;
}

.title strong {
  font-size: 17px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.015em;
}

.title span {
  font-size: 13px;
  color: var(--text-3);
}

.shut {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--text-2);
  transition: background 0.15s;
}

.shut:hover {
  background: var(--fill-hover);
}

.tabs {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 0 18px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--line-soft);
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs button {
  flex: none;
  height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 550;
  color: var(--text-2);
  transition: background 0.15s, color 0.15s;
}

.tabs button:hover {
  color: var(--text);
}

.tabs button[aria-selected="true"] {
  background: var(--text);
  color: var(--surface);
}

.panel {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 22px 26px;
  outline: none;
  animation: panel-in 0.2s ease-out;
}

@keyframes panel-in {
  from {
    opacity: 0;
  }
}

.lede {
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-2);
  text-wrap: pretty;
}

h3 {
  margin: 22px 0 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.panel > h3:first-child {
  margin-top: 0;
}

.plain {
  padding: 9px 0;
  font-size: 15px;
}

.quiet {
  padding: 18px 0;
  font-size: 14px;
  color: var(--text-3);
}

.rows li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 15px;
}

.rows li:last-child {
  border-bottom: 0;
}

.rows.compact li {
  min-height: 0;
  padding: 8px 0;
  font-size: 14.5px;
}

.what {
  min-width: 0;
  display: grid;
  gap: 1px;
  font-weight: 500;
}

.what code,
.sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-3);
}

.sub {
  font-size: 13px;
}

.value {
  flex: none;
  font-size: 14px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

code.value,
.host {
  font-size: 13px;
}

.tag {
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 11px;
  font-weight: 600;
  vertical-align: 1px;
}

.get {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--accent-ink);
  transition: background 0.15s;
}

.get:hover {
  background: var(--fill-hover);
}

.facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px 22px;
  font-size: 14.5px;
}

.facts dt {
  color: var(--text-3);
}

.facts dd {
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.download {
  margin-top: 22px;
  height: 38px;
}

@media (max-width: 640px) {
  .sheet {
    width: 100vw;
    height: min(86dvh, 720px);
    margin: auto 0 0;
    border-radius: 24px 24px 0 0;
    animation-name: sheet-up;
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
  }
}
</style>
