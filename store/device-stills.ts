// bun store/device-stills.ts <origin> <target> [app…] — each listed applet's
// first screen at one device's surface, at density 2, in the store's player on
// its sample data, as store/site/src/devices/stills/<target>/<id>.webp. The
// store's front shows them in that device's frame (store/site/src/devices);
// Omarchy Pocket's are the store's own stills (bun store/shots.ts).
// `origin` is a running site (`bun run site`, http://localhost:5173), whose
// /v1 is the live store's. Needs Google Chrome.
//
// The player runs a variant's JavaScript. The Tab5's own variant is ESP-IDF
// bytecode, so its still is Omarchy Pocket's variant at the Tab5's surface,
// which that variant's adaptive surface takes.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Each device's surface and the variant the player runs for it. */
const DEVICES: Record<string, { size: [number, number]; variant: string }> = {
  "tab5-home": { size: [640, 360], variant: "rg-ds-plus" },
  "3ds-dev": { size: [320, 240], variant: "3ds-dev" },
};

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SETTLE: Record<string, number> = { maps: 8, x: 6, youtube: 12, podcasts: 6, github: 6 };

const [origin = "http://localhost:5173", target = "tab5-home", ...named] = process.argv.slice(2);
const device = DEVICES[target];
if (!device) throw new Error(`no surface for ${target}: ${Object.keys(DEVICES).join(", ")}`);
const [w, h] = device.size;
const OUT = resolve(import.meta.dir, "site", "src", "devices", "stills", target);
mkdirSync(OUT, { recursive: true });
const apps = ((await (await fetch(`${origin}/v1/apps`)).json()) as { apps: { id: string; targets: string[] }[] }).apps
  .filter((app) => app.targets.includes(target))
  .filter((app) => !named.length || named.some((name) => app.id.endsWith(`.${name}`)));

const port = 9500 + Math.floor(Math.random() * 100);
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/device-stills-${port}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
await Bun.sleep(1500);
const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
const ws = new WebSocket(pages.find((p) => p.type === "page")!.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let next = 0;
const waiting = new Map<number, (value: any) => void>();
ws.onmessage = (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id) waiting.get(message.id)?.(message.result ?? message.error);
};
const send = (method: string, params: object = {}) => new Promise<any>((done) => {
  const id = ++next;
  waiting.set(id, done);
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 800, height: 500, deviceScaleFactor: 2, mobile: false });

for (const { id } of apps) {
  await send("Page.navigate", { url: `${origin}/404-tab5-stills` });
  await Bun.sleep(1200);
  // the player frame at the Tab5's surface, over the page, booted as the store's player boots it
  const boot = `(async () => {
    document.body.innerHTML = "";
    const app = await (await fetch("/v1/apps/${encodeURIComponent(id)}")).json();
    const frame = Object.assign(document.createElement("iframe"), { src: "/play/", sandbox: "allow-scripts" });
    frame.style.cssText = "position:fixed;left:0;top:0;width:${w}px;height:${h}px;border:0";
    addEventListener("message", async (event) => {
      if (event.data?.type === "running") window.__running = true;
      if (event.data?.type === "error") window.__failed = event.data.message;
      if (event.data?.type !== "ready") return;
      const [pkg, wasm, mock] = await Promise.all([
        fetch("/v1/packages/" + app.package).then((r) => r.arrayBuffer()),
        fetch("/play/pocketjs.wasm").then((r) => r.arrayBuffer()),
        app.mock ? fetch("/v1/mocks/" + app.mock).then((r) => r.json()) : null,
      ]);
      frame.contentWindow.postMessage({ type: "boot", package: pkg, wasm, mock, size: [${w}, ${h}], target: "${device.variant}" }, "*", [pkg, wasm]);
    });
    document.body.append(frame);
  })()`;
  await send("Runtime.evaluate", { expression: boot, awaitPromise: true });
  await Bun.sleep(1000 * (SETTLE[id.slice(id.lastIndexOf(".") + 1)] ?? 5));
  const failed = (await send("Runtime.evaluate", { expression: "window.__failed ?? (window.__running ? '' : 'not running')", returnByValue: true })).result.value;
  if (failed) {
    console.log(`${id}: ${failed}`);
    continue;
  }
  const shot = await send("Page.captureScreenshot", { format: "webp", quality: 88, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  await Bun.write(resolve(OUT, `${id}.webp`), Buffer.from(shot.data, "base64"));
  console.log(`${id}: ${resolve(OUT, `${id}.webp`)}`);
}
chrome.kill();
process.exit(0);
