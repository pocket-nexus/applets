---
name: pocket-applet
description: Make or change a Pocket Applet with the design system in kit/, for every device the applets run on (Omarchy Pocket, the M5Stack Tab5, the Nintendo 3DS). Use when asked to build a Pocket applet, to port a client to one, or to give one sample data for the store's player.
---

# Making a Pocket Applet

Read these before writing code:

- `kit/README.md`: the design system. A page is rows; the kit draws them.
- `docs/applets.md`: the store, sample data and what an installed app can reach.
- On Omarchy Pocket, `~/Applets/AGENTS.md` (omarchy-pocket's `sdk/AGENTS.md`): the loop on the device and the checklist for done.

`github/` is a full client built from the kit, the example to copy. `template/` is where a new one starts.

## In this repository

```
bun run setup
bun tools/build.ts --apps <name>                 # a package per device whose host contract is at hand, merged in dist/packages
bun -e "import {checkApplet, printFindings} from './tools/check.ts'; printFindings(checkApplet('<name>', 'template'))"
bun store/play/serve.ts dist/omarchy-pocket/<output>.pocket <name>   # the app in a browser on its sample data
```

An applet's directory holds `pocket.app.json` (copy `template/pocket.app.template.json`: the viewport list and the worker domain are the same for every applet), `main.tsx`, `art -> ../ui/art` and `images.json -> ../ui/images.json`.

**The network is `fetch` from `../lib/net.ts`.** A request goes to the applet's worker: its descriptor (URL, method, headers, body) is at most 1020 bytes on every device, and a response at most `NET_MAX_RESPONSE_BYTES`, the device's (4 MiB on Omarchy Pocket, 256 KiB on the Tab5 and the 3DS).

Sample data for the store's player goes in `<name>/mock/mock.json` (format in `tools/mock.ts`; `weather/mock` and `github/mock` are complete). Make it up: no real accounts, no owner's data, no third-party pictures.

## On Omarchy Pocket

`pocket-applet new <name>` in `~/Applets`, then the loop in `~/Applets/AGENTS.md`. A package built here opens on the device with `omarchy-shell pocket.window app <path> <title> applet` over SSH.

## What makes the result bad, in order of how often

1. Drawing pages from `View` and `Text` instead of rows. `tools/check.ts` stops this; do not work around it with the custom-pixels line unless the page is a game, a map or a canvas.
2. Stopping when it compiles. Look at a screenshot of every page, scroll them, tap everything.
3. Testing only the happy path: loading, empty and failed states are pages too.
4. Inventing a palette or icons. The kit has both.
5. Showing what the API returned rather than what a person wants: hashes, ids, ISO dates, nulls.
