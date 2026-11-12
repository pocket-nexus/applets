// Installing is Pocket Hub's work, not this page's: the page hands Hub the
// app, and Hub decides whether a device can run it and installs it. The
// hand-off is a link the system opens Pocket Hub with, and this is the one
// place that builds it.
//
// The link and what Hub does with it are Pocket Hub's docs/DEEP-LINKS.md
// (§1 the link, §2 what Hub does): pocket-hub://store/app/<id>. It carries
// the app's id and nothing else, since Hub reads everything about the app out
// of its own catalog, and following it only shows the app in Hub: installing
// stays the owner's click there.
import type { StoreApp } from "./api.ts";

/** The link that opens Pocket Hub on this app. */
export function hubInstallLink(app: StoreApp): string {
  // An id the store lists needs no encoding (store/src/shared.ts ID). One that
  // somehow held a "?" or a "#" must not read as another app's id with a
  // query, which Hub ignores: encoded, Hub refuses the link instead.
  return `pocket-hub://store/app/${encodeURIComponent(app.id)}`;
}
