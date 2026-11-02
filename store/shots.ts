// bun store/shots.ts [app…] — the store's stills: each applet's first screen
// in the player (store/play) on its sample data, as store/site/shots/<id>.webp
// at 1024 x 768, the surface at density 2. The packages are dist/omarchy-pocket's
// (bun tools/build.ts omarchy-pocket), the variant the website's player runs.
// Needs Google Chrome.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { servePlayer } from "./play/serve.ts";
import { APPS, readContract } from "../tools/apps.ts";
import { DIST, ROOT } from "../tools/paths.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = resolve(import.meta.dir, "site", "shots");
/** Seconds an applet takes to settle on its first screen in the player. */
const SETTLE: Record<string, number> = { maps: 7, x: 5, youtube: 5, podcasts: 5, github: 5 };

const named = process.argv.slice(2);
const apps = (named.length ? named : APPS).filter((app) => existsSync(join(app, "mock", "mock.json")) || named.includes(app));

const port = 9400 + Math.floor(Math.random() * 100);
const profile = join(ROOT, ".pocket", `shots-chrome-${port}`);
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
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
const send = (method: string, params: object = {}) => new Promise<any>((resolve) => {
  const id = ++next;
  waiting.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
await send("Page.enable");
await send("Runtime.enable");
// the local page frames the player 1024 px wide (store/play/serve.ts)
await send("Emulation.setDeviceMetricsOverride", { width: 1064, height: 900, deviceScaleFactor: 1, mobile: false });

for (const app of apps) {
  const output = readContract(app).app.output;
  const pkg = join(DIST, "omarchy-pocket", `${output}.pocket`);
  if (!existsSync(pkg)) throw new Error(`no ${pkg}: bun tools/build.ts omarchy-pocket --apps ${app}`);
  const server = servePlayer({ package: pkg, applet: join(ROOT, app), port: port + 100 });
  await send("Page.navigate", { url: `http://127.0.0.1:${port + 100}/` });
  await Bun.sleep(1000 * (SETTLE[app] ?? 4));
  const box = (await send("Runtime.evaluate", { expression: `JSON.stringify(document.getElementById("player").getBoundingClientRect())`, returnByValue: true })).result.value;
  const r = JSON.parse(box) as { x: number; y: number; width: number; height: number };
  const shot = await send("Page.captureScreenshot", { format: "webp", quality: 86, clip: { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1024 / r.width } });
  const id = JSON.parse(readFileSync(join(ROOT, app, "pocket.app.json"), "utf8")).id as string;
  await Bun.write(join(OUT, `${id}.webp`), Buffer.from(shot.data, "base64"));
  console.log(`${app}: ${join(OUT, `${id}.webp`)}`);
  server.stop(true);
}
chrome.kill();
await Bun.sleep(200);
rmSync(profile, { recursive: true, force: true });
process.exit(0);
