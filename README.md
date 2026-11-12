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
| Spotify | `spotify/` | ✓ | | |
| Store (the applet store client) | `appstore/` | ✓ | | |
| Camera | `camera/` | | ✓ | ✓ |
| Photos | `photos/` | | ✓ | ✓ |
| Notes | `notes/` | | ✓ | ✓ |

Camera and Photos need `camera.photo`, Notes `data.fs`; Omarchy Pocket's host contract offers neither, so its builds leave them out. The Store client talks to omarchy-pocketd's `appstore` service and is built for Omarchy Pocket alone (`ONLY` in `tools/apps.ts`); Pocket Shell installs from its paired Mac. Spotify is built for Omarchy Pocket alone too: its `spotify` service (`spotify/contract.ts`), which signs the owner in with a pairing code confirmed at spotify.com/pair and is this device's Spotify Connect speaker, runs in omarchy-pocketd.

Hacker News, X, YouTube, Discord and GitHub also declare the applet **full-screen presentation**: one screen, no touch, buttons, at the PSP's 480×272. Without touch the d-pad focus holds a row from the start, and a button legend along the bottom (`ui/legend.tsx`) names what each button does on the page. PocketJS's PSP host runs no worker yet and every networked applet needs one, so the resolver leaves them out of a PSP build until it does.

## How an applet reaches each device

| Piece | What it is |
| --- | --- |
| `ui/` | The iOS 6 kit the applets and Pocket Shell's launcher draw with: navigation stack and bar, grouped tables, alerts, text fitting, slot pools for long lists, one touch router per screen. `ui/screen.ts` reads the surface size; `ui/window.tsx` mounts an applet and remounts it when Omarchy Pocket resizes its window. `ui/setup.tsx` is the owner setup page of any companion service (what its `/_setup` answers: the keys the owner types, the vendor programs fetched on the owner's consent, a prompt), in the palette an applet passes. |
| `kit/` | The design system `template/` starts a new applet on (`kit/README.md`): a page is a list of rows. GitHub is the one applet built on it, and `tools/check.ts` holds an applet made on it to its rules. Every other applet here, Spotify among them, draws its own pages with `ui/` and is not held to those rules. |
| `lib/net.ts` | `fetch` for an applet. **The UI realm has no network**: a request goes to the applet's worker (`lib/net-worker.ts`, declared in every networked applet's `domains.worker`) as a record on the `request` ring, and the worker performs it with the device's `http` node: the Pocket Link to a paired Mac on the 3DS, the firmware's own HTTP on the Tab5, omarchy-pocketd on Omarchy Pocket. One request's descriptor (URL, method, headers and body as JSON) is at most **1020 bytes**. One response is at most what the device's host contract states (`worker.http.responseBytes`: **4 MiB** on Omarchy Pocket, **256 KiB** where it states none), and the `response` ring is declared `"host"`, so each device's build takes the channel its contract states (**64 records of 16 KiB** on Omarchy Pocket, **8 of 1 KiB** elsewhere). |
| `lib/store.ts` | A JSON document in the companion's `store` service, whatever its size: saved whole when one `/set` fits a request's 1020-byte descriptor, else in parts `<name>.0…` and then `{"parts": n}` under `<name>`. Weather's places and Podcasts' library use it. |
| `lib/mock.ts` | Sample data in place of the worker: the same channel bridge, answered from `mock/mock.json`. The store's player and the tests run applets on it. |
| `ui/companion.ts` | Where an applet's services run, as its text names them: on the device itself on Omarchy Pocket, on the paired Mac elsewhere. |
| `ui/art/icons/`, `ui/icons.tsx` | **The one icon family**: every applet's icon and the launcher's own (Settings, Mac, Wi-Fi, Apps), baked at 24, 46 and 64 px and at `@2x`. `ui/icons.tsx` maps an app id to its icon and draws the tile; Pocket Shell's launcher imports it, applets never do, so no applet package carries the family. Each applet's `icon.png`, the picture the store lists and `pocket compile` stores in the package, is a link to its `<name>-64@2x.png`. |

The applets read the device from PocketJS (`@pocketjs/framework/applet`, `platform`, `link`, `osk`), so no file here is per device.

## Building

```sh
bun run setup                                   # the pocketjs submodule, its packages, the runtime links
bun tools/build.ts                              # every applet, for every device whose host contract is at hand
bun tools/build.ts omarchy-pocket --apps weather
bun run check                                   # typecheck (the applets, the store's website), the applet rules, the sims, the store
```

### Icons

```sh
bun run icons --only notes,github               # render in Blender, bake into ui/art/icons
```

`tools/icons/icons.py` models each icon in Blender as an iOS 6 tile: a lacquered or metal plate with a raised, bevelled object on it, lit from above. `tools/icons/nexus.ts` draws Pocket Nexus's (the PocketJS mark). `tools/icons/bake.ts` gives every render the same finish (the rounded-square mask, the gloss, the rim and, at 46 px, the drop shadow) and writes the textures and a contact sheet in `.pocket-build/validation/icons`. Builds read the committed PNGs and never need Blender. Cycles output differs between runs, so `--only` re-renders the icons that changed and the sheet is reviewed before a commit. A new applet adds its scene to `icons.py`, its sizes to `bake.ts`, its id to `APP_ART` in `ui/icons.tsx`, and links `icon.png`; `test/applets.test.ts` fails an applet without all four.

Packages go to `dist/<device>/<output>.pocket`, and `dist/packages/<output>.pocket` holds every variant built. A device's host contract lives with its program: Omarchy Pocket's in [pocket-nexus/omarchy-pocket](https://github.com/pocket-nexus/omarchy-pocket) (`OMARCHY_POCKET_ROOT`, default `../omarchy-pocket`), the Tab5's in pocket-nexus/pocket-m5 (`POCKET_M5_ROOT`, default `../pocket-m5`), the 3DS's in PocketJS (`3ds-dev`). Omarchy Pocket and Pocket Shell take this repository as a submodule (`vendor/applets`) and build the applets from it. A Tab5 or a 3DS installs them from Pocket Hub on a paired Mac, which carries them. Pocket Hub is not released yet.

## The store

`store/` is the Cloudflare Worker and website at applets.pocket.nexus: D1 for publishers and versions, R2 for packages, icons and sample data. The website is a Vue app in `store/site/`:

```sh
bun run site                                    # the store's pages with hot reload, on the live store's data
bun run site:build                              # store/site/dist, which the Worker serves
```

An app's page there has one way to install it, a button that opens Pocket Hub; that hand-off is not open yet, and the button says so. [docs/applets.md](docs/applets.md) has the store's routes, the website, the publishing rules, the sample data format and what an installed app can reach.

## License

GPL-3.0-or-later ([LICENSE](LICENSE)). The PocketJS submodule is MIT.
