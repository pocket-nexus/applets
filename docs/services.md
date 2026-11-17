# Services: the half of an app that runs on a computer

**Status: a draft of version 1. None of it is built yet.** "Where things stand" at the end lists what exists today and what each repository changes.

An applet has no network of its own beyond `fetch`, holds no credential and runs no program. What needs a computer (signing in with the owner's account, running yt-dlp and ffmpeg, being a Spotify Connect speaker) is done for it by a **service**: the app's daemon, which answers the applet's requests at `https://companion.pocket/<name>/…`. A **service host** runs services: Pocket Hub on a paired Mac or Linux computer for a 3DS or a Tab5, omarchy-pocketd on Omarchy Pocket itself.

This standard says how a service is written, built, published and run, so that one source runs under every service host and reaches it the same way: as one file.

## Two kinds of service

| Kind | Names | Who implements it | How it reaches a host |
|---|---|---|---|
| **Host service** | `store`, `glyphs`, `images`, `maps`, `appstore` | each service host, for itself: it depends on the host (glyphs at the device's density, the device's image format) and acts for no account | it is part of the host |
| **App service** | `x`, `discord`, `youtube`, `podcasts`, `homeassistant`, `spotify` | the app it belongs to, once, in this repository | a **service file**, built here and published with the app |

**This standard is about app services.** A host service's name is reserved: no app service takes one.

## The parts

A service lives in its applet's directory and has the applet's name:

```
spotify/
  pocket.app.json          the applet; applet.services lists "spotify"
  contract.ts              what the service answers: the one file both halves read
  api.ts                   the applet's client of the contract
  mock/                    sample data that answers the contract in the store's player
  service/
    pocket.service.json    the service's manifest
    main.ts                the service's entry
```

**One applet has at most one service, and the service's name is the applet's directory.** An applet that uses a service lists it in `applet.services`, as today; any applet may list another app's service.

## The contract

`contract.ts` is the wire between the two halves: a header comment with one line per route (method, path, request, answer) and the types of every request and answer. `spotify/contract.ts` is the model.

- **Types only, and it imports nothing**, so either half, the mock and a host can `import type` it from anywhere.
- A request and an answer are JSON, unless the route says bytes (a picture, a glyph atlas). A failure answers 4xx or 5xx with `{"error": "…"}`; a contract may add a `reason` the applet acts on.
- A path that starts with `/_` is the host's (`/_setup`, below). A service defines none.
- The applet's `api.ts` and the service's `main.ts` both take their types from it; neither declares a wire type of its own.

## The manifest

`service/pocket.service.json` (the values here are made up to show the shape):

```json
{
  "service": 1,
  "name": "spotify",
  "entry": "spotify/service/main.ts",
  "autostart": true,
  "setup": {
    "title": "Spotify",
    "fields": [{ "id": "soloist-key", "label": "Soloist API key", "secret": true }],
    "tools": [{ "id": "soloist", "title": "Soloist", "vendor": "Spotify", "terms": "https://…", "builds": { "linux-arm64": { "url": "https://…", "archive": "tar.gz", "binary": "soloist" } } }]
  },
  "commands": ["omarchy-pocket-spotify"]
}
```

| Key | What it says |
|---|---|
| `service` | the version of this standard the service is written to: the protocol below |
| `name` | the service's name: the applet's directory, `^[a-z][a-z0-9-]{0,31}$` |
| `entry` | the entry module, relative to this repository |
| `autostart` | `true` for a service that runs from the moment its host does (a speaker a phone must find, a gateway that stays connected). Without it the service starts at the first request for it |
| `setup` | what the service needs from its owner, as PocketJS's `SetupSpec` (`contracts/spec/owner-setup.ts`): fields the owner types once, and a vendor's own programs fetched on the owner's consent to the vendor's terms. **The host runs it**: it keeps the values, fetches the tools and answers `/<name>/_setup`, the same way for every service. Absent when the service needs nothing |
| `commands` | the command-line programs the service runs, by name (`yt-dlp`, `ffmpeg`, `omarchy-pocket-spotify`). The service starts them itself; the host's computer has them, or the host says which are missing. Absent when it runs none |

**The service has no version of its own.** It is published with the applet as one version of the app, under the applet's `id` and `version`.

## A service is a process, and the host brings the Bun

**A host runs each service as a process of its own**: `<the host's Bun> <name>.service.js`, one process for one service. A service that fails or hangs takes nothing else down, and replacing one is stopping a process and starting another.

**A service host carries its own Bun and runs every service with it.** It does not look for a `bun` on `PATH`, and a service brings no runtime.

**A service is never an executable.** It is one JavaScript file for the host's Bun, and a host runs nothing an app brings in any other way. The native programs a service needs are not in it and do not come with it: it starts command-line programs the host's computer has, by the names its manifest lists (`commands`), and a vendor's program the owner consented to (`setup.tools`).

## The entry

`main.ts` hands `serve` what the service does:

```ts
import { serve } from "../../lib/service.ts";

serve((context) => ({
  async handle(request) { … },   // every request under /<name>/, but /_…
  async state() { … },           // optional: what the host's own window shows; never a credential
  async command(args) { … },     // optional: an owner command from the host's command line
  async close() { … },           // optional: called before the process exits
}));
```

**`lib/service.ts` is the service's side of the protocol below**, bundled into every service: it listens, hands each request to `handle`, and asks the host for what `context` holds. A service is written to it and not to the wire.

A request is what a host hands a service today (`method`, `path` after the service's name, `query`, `body`, `maxBytes`, the `console` that asked, an abort `signal`), and an answer is `{status, headers, body}`. A thrown `ServiceError(status, body)` answers that status with that body as JSON; anything else thrown answers 502 and goes to the log.

`context` is everything a service gets from its host:

| Member | What it is |
|---|---|
| `service` | the version of this standard the host implements |
| `host` | `{name, version, platform, computer}`: `pocket-hub` or `omarchy-pocketd`, and how the owner is told where the service runs ("your Mac", "this device") |
| `dir` | the service's own directory (mode 0700), which is also where the process starts: everything it keeps is under it |
| `log(line)` | a line in the host's log |
| `setup` | the manifest's setup as the host keeps it: `value(field)`, `tool(id)` (the path of a vendor tool once it is fetched, else null), and `prompt(prompt \| null)` for something the owner does elsewhere (a code to confirm, a device to pick). Null without a `setup` |
| `command(name)` | the path of a command the manifest lists, found on the `PATH` the host started the service with, or null when this computer has none. A name the manifest does not list is an error |
| `supervise(options)` | keeps a program running: started again when it exits, stopped with the service |

**A service reads its setup once, when it starts.** When the owner changes a field, or a tool arrives, the host starts the service again. A command is looked up each time it is asked for, so one installed while the service runs is found.

**A host may lack these**, so each is optional and a service that uses one works without it or answers why it cannot:

| Member | What it is | Today |
|---|---|---|
| `decodeImage` | a picture's bytes as RGBA at a size | `sips` on a Mac, ffmpeg on Omarchy Pocket; passed to X as an option |
| `webSignIn` | a sign-in window on the host's screen | Pocket Hub's `pocket-websignin` on a Mac, for X |
| `nowPlaying` | tells the device what plays on it | omarchy-pocketd's `onMedia`, for Spotify |

Their shapes are set as the service that uses each one is ported.

## The protocol

What a host implements, and what `lib/service.ts` speaks. Both directions are HTTP on unix sockets the host makes for the one service (mode 0600): an applet can reach 127.0.0.1 for media streams, and it cannot reach these.

**Starting.** The host runs `<its Bun> <name>.service.js` in the service's `dir` with:

| | |
|---|---|
| `POCKET_SERVICE_SOCKET` | the path the service listens on |
| `POCKET_HOST_SOCKET` | the path the host answers the service on |
| `PATH` | the host's own directory of programs first (what its image installed, what it fetched for the owner), then the computer's `PATH` |
| stdout and stderr | each line is a line of the host's log |

The service is ready when its socket accepts a connection; a host waits 10 seconds for that.

**The host asks the service**, on the service's socket:

| Request | What it is |
|---|---|
| `<method> /<path>?<query>` | an applet's request as it came, body and all, with the headers `pocket-app` (the id of the app that asked), `pocket-console-name`, `pocket-console-address`, `pocket-console-local-address` and `pocket-max-bytes`. The status, the content type and the body go back to the applet. The host cancels a request by closing its connection |
| `GET /_state` | the service's `state()`; 404 when it has none |
| `POST /_command` with `{"args": […]}` | the service's `command()`: `{"text": "…"}` |

An applet's own request for a path under `/_` never reaches the service: `/_setup` is answered by the host, and any other is refused.

**The service asks the host**, on the host's socket:

| Request | What it is |
|---|---|
| `GET /context` | `{service, host, setup: {values, tools}, offers}`: what `context` holds, the paths of the tools in place, and which of the optional members this host has |
| `POST /prompt` | a `SetupPrompt` to show at `/_setup`, or `null` to take it away |
| one route for each optional member | set with the member |

**Stopping.** The host sends SIGTERM, and SIGKILL 5 seconds later to whatever is left of the service's process group, so a program the service started never outlives it. A service that exits by itself is started again a second later, then twice as long each time, at most every 30 seconds.

**The protocol grows by adding routes and members, and `service` stays 1.** A change that breaks a service written to it makes it 2.

## What a service does not do

1. **It imports nothing from a host.** No path into pocket-hub or omarchy-pocket: what it needs from the host is in `context`. PocketJS's pure modules (the image entry encoder, the media stream server) are imported from `vendor/pocketjs` and end up in its bundle.
2. **It starts no program but one its manifest names**: a command in `commands`, through `context.command`, or a `setup.tools` entry. Nothing it downloaded itself, nothing it wrote, and no path written in its source.
3. **It keeps files only under `context.dir`**, and a secret there with mode 0600.
4. **No credential leaves it**: not in an answer, not in `state()`, not in the log.

## The service file

`bun tools/build.ts` builds each applet's service beside its packages, as `dist/services/<name>.service.js`:

```
//! pocket-service {"service":1,"name":"spotify","id":"dev.pocket-nexus.spotify","version":"0.1.1","bun":"1.4.2","setup":{…},"commands":[…]}
…the bundle…
```

- **The first line is the manifest**: the prefix `//! pocket-service `, then the manifest as one line of JSON, without `entry`, with the applet's `id` and `version` and with `bun`, the version in `.bun-version` it was built and tested on. A store or a host reads what a service is from that line and runs nothing.
- **The rest is one program for Bun** (`bun build --target=bun --format=esm`) with everything bundled: the only imports left are `node:*` and `bun`.
- A host whose Bun is older than `bun`, or of another major version, does not run it.
- At most **4 MiB**. Its identity is its SHA-256.

## The store

**A version of an app is its package, its icon and, when it has one, its service file.** The service is a file of its own in the store, as the icon is, not a part of the `.pocket`: a device downloads its package and never the service.

| What | How |
|---|---|
| Publishing | `POST /v1/publish` takes a `service` file. `bun store/admin.ts publish <package> <icon> [summary] --service <file>` |
| What the store checks | the first line parses; its `id` and `version` are the package's; its `name` is in the package's `applet.services` and is no host service's; the size |
| The signature | a version with a service signs `omarchy-pocket-store/2`: the six fields of `/1`, then the service file's SHA-256. A version without one signs `/1` as today, so nothing published changes |
| The file | `GET /v1/services/<sha256>`, immutable, for a listed version |
| The listing | an app's entry gains `service` (the SHA-256, or `""`), and its details gain the service's name, what its setup asks for and the commands it runs |

**Only the official key publishes a service.** A service runs as the host's user on the owner's computer, with no sandbox. The store refuses a `service` file from any other key, and a host refuses to install one that the official key did not sign. An app from anyone else reaches `store`, `glyphs`, `maps` and `images`, as today.

## What a host does

A service enters a host **one way: as a service file**, whether the host installs the app from the store or carries it in its own build (Omarchy Pocket's image, Pocket Hub's `--apps`), where the file sits beside the app's package.

1. **Install.** With an app that has a service: check the signature (`/2`) against the official key, fetch `/v1/services/<sha256>`, check the SHA-256, read the first line. Refuse it when `service` is newer than the host implements, when `bun` asks for more than the host's Bun, when `id` and `version` are not the package's, or when `name` is a host service's. Tell the owner which of its `commands` this computer lacks; how one gets there (the host's image, the host fetching it for the owner, the owner installing it) is the host's.
2. **Start.** With the host when the manifest says `autostart`, else at the first request for `/<name>/…`, as "The protocol" says. A host service's name is answered by the host, whatever was installed.
3. **Answer.** `/<name>/_setup` from the manifest's `setup`; everything else is forwarded. An app is answered only when its own manifest lists the service in `applet.services`, as today. A service that is not running, or not ready in time, answers the applet 502.
4. **Update.** Stop the service, put the new file in place, start it. `dir` stays: a sign-in outlives an update.
5. **Remove.** Stop the service, then delete the service file and `dir`.

## Versions

- **One version of an app is one package and one service.** A host that installs version N runs service N and offers applet N.
- **A console may still run the applet of an earlier version** when its host has moved on. So within one major version a contract only grows: new routes, new optional members. A change that breaks an older applet is a new major version of the app.
- A host runs one service per name: the one of the newest version installed.

## Checks

`bun run check` holds an applet with a `service/` directory to this:

- `pocket.service.json` is valid, `name` is the directory and is in the applet's `applet.services`, and no host service has it
- `contract.ts` is there and imports nothing; `api.ts` and `service/main.ts` import their wire types from it
- the service builds, the bundle's only imports are `node:*` and `bun`, and it is under 4 MiB
- no source file of the service imports from outside this repository
- the source starts a program only at a path `context.command` or `context.setup.tool` gave it: a spawn of a name or a path written in the source is an error
- run under a stand-in host, the service file is ready within 10 seconds, answers `GET /_state` or 404, and exits within 5 seconds of SIGTERM

## Not in version 1

A service from a publisher other than the official key, and with it a sandbox and declared permissions; a service that is an executable, or one run by anything but the host's Bun; native code inside the service file, and a native program that reaches a host through the store; a version or a store entry for a service apart from its app; host services as service files.

## Where things stand

| | Today | With this standard |
|---|---|---|
| Where a service's source is | Pocket Hub (`tools/companion/services/*.ts`) for x, discord, youtube, podcasts, homeassistant; omarchy-pocket (`daemon/spotify.ts`) for spotify | this repository, `<applet>/service/` |
| The contract | written down for Spotify alone (`spotify/contract.ts`); the others are what the service's code and the applet's `api.ts` each assume | `contract.ts` in every applet that has a service |
| How a host gets a service | compiled in: `SERVICE_FACTORIES` in Pocket Hub's `services.ts`; omarchy-pocketd imports that file by path from `vendor/pocket-hub` and assigns its own entries | a service file |
| How a service runs | as an object inside the host's process | as a process of its own, run by the host's Bun |
| What a service gets from its host | a `ServiceContext` of `storeDir` and `log`, plus imports of the host's modules (`OwnerSetup`, `Supervised`, `ManagedTools`, `writeSecret`) and options a host passes one service (`decodeAvatar`, `onMedia`) | `context`, over the protocol |
| Owner setup | declared in the service's code | declared in the manifest, run by the host |
| A native program | started by the service, found where each host keeps it: `omarchy-pocket-spotify` at a fixed path the image installs, yt-dlp and ffmpeg in Pocket Hub's tools directory and then on `PATH` | started by the service the same way, by a name its manifest lists, found on the `PATH` its host gives it |
| The store | holds no service | holds the service file of a version |

What each repository changes, in the order it can land:

| Repository | Change |
|---|---|
| pocketjs | `contracts/spec/service.ts`: the manifest, the protocol's routes and headers, `context`, as types and constants that import nothing (beside `owner-setup.ts`) |
| applets | `lib/service.ts`, the service's side of the protocol; `tools/build.ts` builds service files and `tools/check.ts` checks them; the store takes, signs for and serves a service file (one added column, `versions.service`); the six services move in, each with its `contract.ts` |
| pocket-hub | Pocket Hub.app carries the Bun that runs services; its service host installs service files, runs each as a process and speaks the protocol; its tools directory (yt-dlp, ffmpeg) goes first on a service's `PATH`; the five app services leave `tools/companion/services/`; the host services stay |
| omarchy-pocket | omarchy-pocketd runs service files through the same service host, with the device's Bun; `daemon/spotify.ts` moves to `spotify/service/` here; `omarchy-pocket-spotify` stays in the image, in the directory that goes first on a service's `PATH`; the image carries the service files beside the packages |
