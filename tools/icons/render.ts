// bun tools/icons/render.ts <name> <size> <out.png> — an icon drawn as SVG in
// tools/icons/<name>.html (SIZE stands for its side), rendered to a
// transparent PNG with headless Chrome. github.html draws GitHub's mark (the
// Octicons mark-github path, MIT) on the applets' dark glass tile.
const [name, size, out] = process.argv.slice(2);
const port = 9600 + Math.floor(Math.random() * 100);
const dir = import.meta.dir;
const chrome = Bun.spawn(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/prof-${port}`, "--no-first-run", "about:blank"], { stdout: "ignore", stderr: "ignore" });
await Bun.sleep(1500);
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as any[];
const ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id) wait.get(m.id)?.(m.result ?? m.error); };
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const html = (await Bun.file(`${dir}/${name}.html`).text()).replaceAll("SIZE", size!);
// served over HTTP: headless Chrome may not read a file:// page outside its own folders
const server = Bun.serve({ port: 0, fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` }); await Bun.sleep(800);
const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: +size!, height: +size!, scale: 1 } });
await Bun.write(out!, Buffer.from(shot.data, "base64"));
server.stop(true);
chrome.kill(); await Bun.sleep(200); await Bun.$`rm -rf ${dir}/prof-${port}`.quiet().nothrow(); process.exit(0);
