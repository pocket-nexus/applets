# Pocket Applets

Small apps for pocket devices, written once on [PocketJS](https://github.com/pocket-nexus/pocketjs), and the store that carries them at **[applets.pocket.nexus](https://applets.pocket.nexus/)**.

Each directory with a `pocket.app.json` is one applet. **One source builds a variant for every device whose host contract admits it**, and the store's package for a version holds all of them; a device opens the variant for its own target.

| Applet | Directory | Omarchy Pocket | M5Stack Tab5 | Nintendo 3DS |
| --- | --- | --- | --- | --- |
| Weather | `weather/` | ✓ | ✓ | ✓ |
| Hacker News | `hn/` | ✓ | ✓ | ✓ |
| GitHub | `github/` | ✓ | ✓ | ✓ |
| X | `x/` | ✓ | ✓ | ✓ |
| Discord | `discord/` | ✓ | ✓ | ✓ |
| YouTube | `youtube/` | ✓ | ✓ | ✓ |
| Podcasts | `podcasts/` | ✓ | ✓ | ✓ |
| Maps | `maps/` | ✓ | ✓ | ✓ |
| Home (Home Assistant) | `homeassistant/` | ✓ | ✓ | ✓ |
| Store (the applet store client) | `appstore/` | ✓ | | |
| Camera | `camera/` | | ✓ | ✓ |
| Photos | `photos/` | | ✓ | ✓ |
| Notes | `notes/` | | ✓ | ✓ |

Camera and Photos need `camera.photo`, Notes `data.fs`; Omarchy Pocket's host contract offers neither, so its builds leave them out. The Store client talks to omarchy-pocketd's `appstore` service and is built for Omarchy Pocket alone (`ONLY` in `tools/apps.ts`); Pocket Shell installs from its paired Mac.

## How an applet reaches each device

| Piece | What it is |
| --- | --- |
| `ui/` | The iOS 6 kit the applets and Pocket Shell's launcher draw with: navigation stack and bar, grouped tables, alerts, text fitting, slot pools for long lists, one touch router per screen. `ui/screen.ts` reads the surface size; `ui/window.tsx` mounts an applet and remounts it when Omarchy Pocket resizes its window. |
| `kit/` | The design system newer applets are written on (`kit/README.md`): a page is a list of rows. GitHub is built on it, and `tools/check.ts` holds an applet made on it to its rules. |
| `lib/net.ts` | `fetch` for an applet. **The UI realm has no network**: a request goes to the applet's worker (`lib/net-worker.ts`, declared in every networked applet's `domains.worker`) as a record on the `request` ring, and the worker performs it with the device's `http` node: the Pocket Link to a paired Mac on the 3DS, the firmware's own HTTP on the Tab5, omarchy-pocketd on Omarchy Pocket. One request's descriptor (URL, method, headers and body as JSON) is at most **1020 bytes**, one response at most **256 KiB**. |
| `lib/mock.ts` | Sample data in place of the worker: the same channel bridge, answered from `mock/mock.json`. The store's player and the tests run applets on it. |
| `ui/companion.ts` | Where an applet's services run, as its text names them: on the device itself on Omarchy Pocket, on the paired Mac elsewhere. |

The applets read the device from PocketJS (`@pocketjs/framework/applet`, `platform`, `link`, `osk`), so no file here is per device.

## Building

```sh
bun run setup                                   # the pocketjs submodule, its packages, the runtime links
bun tools/build.ts                              # every applet, for every device whose host contract is at hand
bun tools/build.ts omarchy-pocket --apps weather
bun run check                                   # typecheck, the applet rules, the sims, the store
```

Packages go to `dist/<device>/<output>.pocket`, and `dist/packages/<output>.pocket` holds every variant built. A device's host contract lives with its program: Omarchy Pocket's in [pocket-nexus/omarchy-pocket](https://github.com/pocket-nexus/omarchy-pocket) (`OMARCHY_POCKET_ROOT`, default `../omarchy-pocket`), the Tab5's in pocket-nexus/pocket-m5 (`POCKET_M5_ROOT`, default `../pocket-m5`), the 3DS's in PocketJS (`3ds-dev`). Omarchy Pocket and Pocket Shell take this repository as a submodule (`vendor/applets`) and build the applets they ship from it.

## The store

`store/` is the Cloudflare Worker and website at applets.pocket.nexus: D1 for publishers and versions, R2 for packages, icons and sample data. [docs/applets.md](docs/applets.md) has its routes, the publishing rules, the sample data format and what an installed app can reach.

## License

GPL-3.0-or-later ([LICENSE](LICENSE)). The PocketJS submodule is MIT.
