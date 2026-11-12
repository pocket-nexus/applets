// The words for what a package names by id: the devices its variants target,
// the services and capabilities its manifest lists, the sections of a build.
// They are read in an app's details sheet and nowhere else.

/** The device behind a variant's target id. */
const DEVICES: Record<string, string> = {
  "rg-ds-plus": "Omarchy Pocket",
  "tab5-home": "M5Stack Tab5",
  "3ds-dev": "Nintendo 3DS",
};
const DEVICE_ORDER = Object.keys(DEVICES);

export const deviceName = (target: string) => DEVICES[target] ?? target;

/** Targets in the order the store names devices, unknown ones last. */
export function byDevice<T>(items: readonly T[], target: (item: T) => string): T[] {
  const rank = (item: T) => {
    const at = DEVICE_ORDER.indexOf(target(item));
    return at < 0 ? DEVICE_ORDER.length : at;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** What a companion service does for the app that lists it. */
const SERVICES: Record<string, string> = {
  store: "Keeps its own settings on the device",
  glyphs: "Draws characters the package did not bake",
  maps: "Fetches map tiles",
  images: "Fetches images",
  x: "Acts as your X account",
  discord: "Acts as your Discord account",
  homeassistant: "Acts on your Home Assistant",
  github: "Acts as your GitHub account",
  youtube: "Fetches video for you",
  podcasts: "Fetches feeds and audio for you",
  spotify: "Acts as your Spotify account",
  weather: "Fetches the forecast",
  hn: "Fetches Hacker News",
};

export const serviceRole = (service: string) => SERVICES[service] ?? "A service on the device";

/** What each capability an applet may declare lets it do (PocketJS contracts/spec/applet.ts). */
const CAPABILITIES: Record<string, string> = {
  "text.glyphs.baked": "Text from glyphs baked into the package",
  "text.glyphs.runtime": "Characters it did not bake, from the device's fonts",
  "input.buttons": "The gamepad's buttons",
  "input.analog.left": "The left stick",
  "input.text": "A keyboard's typing",
  "display.auxiliary": "A touch surface of its own",
  "input.touch.auxiliary": "Touch on that surface",
  "net.http": "HTTP requests, made by the device on its behalf",
  "ui.physics": "The core's 2D physics",
  "audio.pcm": "Sound it makes itself",
  "media.playback": "Audio and video streams",
  "data.fs": "Files of its own",
  "system.agent": "The device's coding agent can operate it",
};

export const capabilityRole = (id: string) =>
  CAPABILITIES[id] ?? (id.startsWith("camera.") ? "The camera" : "A capability this page does not describe yet");

/** A build's sections by name (store/src/shared.ts SECTION_NAMES). */
const SECTIONS: Record<string, string> = {
  js: "Bundle",
  pak: "Assets",
  plan: "Build plan",
  cover: "Cover",
  bytecode: "Bytecode",
  workerJs: "Worker bundle",
  workerBytecode: "Worker bytecode",
  hostInputs: "Host inputs",
};

export const sectionName = (name: string) => SECTIONS[name] ?? name;
