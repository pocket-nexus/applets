# Applets, their sample data and the store

An applet is a PocketJS package that declares the `applet` section (PocketJS `docs/APPLETS.md`): one touch surface that admits 320 × 240, an allowlist of capabilities, the companion services and hosts it reaches. Every applet here builds from one source for every device whose host contract admits it (README, "Building"), and the store at applets.pocket.nexus carries the packages.

## The store

`store/` is a Cloudflare Worker on `applets.pocket.nexus` with D1 (publishers, apps, versions) and R2 (packages, icons and sample data, named by SHA-256). `/v1/*` is the Worker's; every other path is the website in `store/site/`. The store's first host, `oma.pocket.nexus`, answers `/v1/*` for devices that still ask there and sends every page to omapocket.org with a 301.

| Route | Answer |
|---|---|
| `GET /v1/catalog?profile=<hex>` | the newest listed version of each app with a variant built for that device profile |
| `GET /v1/apps` | the newest listed version of every app, for the website; `targets` names the device of each variant |
| `GET /v1/apps/<id>` | one app's newest listed version |
| `GET /v1/apps/<id>/versions` | every listed version of one app, newest first |
| `GET /v1/packages/<sha256>`, `/v1/icons/<sha256>` | a listed version's files, immutable |
| `GET /v1/manifests/<sha256>` | a listed package's manifest and directory: targets, host ABI, profile hash, build hash, section sizes; read from the first 64 KiB of the file in R2 |
| `GET /v1/mocks/<sha256>` | a listed version's sample data, immutable |
| `POST /v1/publish` | a signed package, icon, author and summary, and sample data when there is some |
| `/v1/admin/*` | an editor's: pending, review, files, mock, backfill |

**A publisher is an ed25519 key**, made on first publish (Omarchy Pocket keeps it at `~/.config/omarchy-pocket/publisher.pem`). The first key to publish an id or an author name owns it; a later version must come from the same key and be newer. The signature covers the id, version, package hash, icon hash, author and summary, and the device checks it again at install.

**A version from the official key is listed at once. Any other waits for an editor**, and an unlisted file cannot be downloaded. An editor works from a computer holding `~/.config/omarchy-pocket-store`:

```
bun store/admin.ts pending
bun store/admin.ts fetch <id> <version> <dir>
bun store/admin.ts list <id> <version>
bun store/admin.ts remove <id> <version>
bun store/admin.ts publish <package.pocket> <icon.png> [summary] [--mock <applet dir>]
bun store/admin.ts mock <id> <version> <applet dir>    # or --none
bun store/admin.ts backfill
```

The store never runs what it holds, and it cannot read a package's source for review: `fetch` and running it on a device are the review. A publish is limited to 16 MiB, 20 a day from one address and 5 versions waiting per key. There is no account system: `dev.pocket-nexus.*` and author names beginning `pocket-nexus`, `omarchy`, `official`, `admin` or `store` belong to the official key.

**An app's page shows the devices it runs on and what the package asks of them**, from its directory and manifest: a chip per variant (`rg-ds-plus` is Omarchy Pocket, `tab5-home` the M5Stack Tab5, `3ds-dev` the Nintendo 3DS) and how each installs it, the capabilities it needs and the ones it uses where a device has them, each with what it lets the app do, the surface it lays out for, its framework and applet API version, and for each build the target, host ABI, profile hash, build hash and the size of its bundle and assets.

## Sample data, and an app in a browser

An applet's every request goes through its worker's channels (`lib/net.ts`, records in `lib/net-wire.ts`), so one stand-in there runs it with no device, no worker and no network: `createMockWorker` in `lib/mock.ts` is the channel bridge a realm finds on `globalThis.__pocketWorkerChannels`, and it answers from **sample data** with the worker's rules (two requests at a time, the rest waiting; a head, the body in records and an end; one look at the response ring takes at most eight records). An applet keeps its sample data in `mock/mock.json` (format in `tools/mock.ts`):

| Key | What it holds |
|---|---|
| `store` | the store service's documents by name: what the applet saved on the device. `/get`, `/set`, `/delete` and `/list` answer from it, and what the applet sets lasts for the session |
| `routes` | requests and answers, tried in order: `method` (`GET` when absent, `*` for any), `url` with `*` for any run of characters, `status`, `headers`, `delay` in ms, and the body as `file` beside `mock.json`, `json` or `text` |
| `images` | pictures for the images service by source URL pattern; the browser decodes and scales them to the IMG entry the device's service makes |

A request nothing answers fails as a connection error does on a device. `tools/check.ts` refuses sample data it cannot pack; the store takes 4 MiB packed. **Every sample is made up** (people, accounts, servers, channels, videos, podcasts, a house) except Weather's, which holds real Open-Meteo answers for six places, and Hacker News's, a snapshot of its public feeds. Maps draws a made-up island town from tiles generated for it, under the attribution the applet always shows.

**The store's page runs a version that has sample data.** `store/play/player.ts` (built by `bun store/build-player.ts` into `store/site/play/`) runs the package's own bundle and pak for its `rg-ds-plus` variant on PocketJS's core in WebAssembly, draws the touch surface at 512 × 384 on a canvas at density 2, turns each pointer into a contact and a wheel or a two-finger trackpad swipe into one dragging contact that lifts once the wheel rests, and takes arrows, Enter and Escape as the D-pad, A and B. It runs in an iframe sandboxed with `allow-scripts` alone, under a policy with `connect-src 'none'` and `img-src 'none'` (`store/site/_headers`): the frame has no origin and no network, and the page posts it the package, the sample data and the core. A failure inside the frame reaches the page with its message and the first lines of its stack. The page lists every request the app made and what answered it. The sample data is not signed: an editor reads it with the rest of a pending version, and it reaches nothing but the frame. `bun store/play/serve.ts <package> <applet dir>` serves the same player with the sample data packed again on each load, and `bun store/shots.ts` writes each applet's first screen in it as the store's stills.

## What an installed app can reach

On Omarchy Pocket the device's own applets hold the owner's X, Discord and Home Assistant sign-ins through the companion services in omarchy-pocketd (`daemon/companion.ts` in pocket-nexus/omarchy-pocket). An app from the store by anyone but the official key runs apart:

| Reach | System apps, official apps, apps built on this device | Apps from the store |
|---|---|---|
| Services | what `applet.services` lists | only `store`, `glyphs`, `maps`, `images`, of what it lists |
| `store` names | shared | its own: names get a prefix from its id, and `/list` is refused |
| The internet, and pictures through `images` | any public address | only the hosts in `applet.hosts`, shown before the install |
| Media streams | 127.0.0.1 | 127.0.0.1 |
| The `appstore` service | the store's own package, from `/usr/share` only | no |

`podcasts` and `youtube` are closed as well: they fetch URLs an app names, which would pass around its declared hosts. The compiler's applet rules run on the publisher's machine, so they prove nothing here; these limits are held by `daemon/appstore.ts` and `daemon/companion.ts` at each request. An app from the store is installed under its whole id, so it cannot stand in for a system app's file. **An app built on the device with `pocket-applet run` is not isolated**: it is the owner's own code, as anything the owner's agent runs in a terminal is.
