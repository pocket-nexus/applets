// Installing is Pocket Hub's work, not this page's: the page hands Hub the
// app, and Hub decides whether a device can run it and installs it. The
// hand-off is a link the system opens Pocket Hub with, and this is the one
// place that builds it, and that tells whether anything took it.
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

/** Where a computer without Pocket Hub gets it: Hub's download page (its
 *  site/), which takes nothing from the page that sent the visitor there. Once
 *  Hub is installed, the same link opens it. */
export const HUB_DOWNLOAD = "https://hub.pocket.nexus/";

// A browser never tells a page whether a link to another program opened one,
// but it shows it. Pocket Hub coming to the front takes the focus from the
// page, and so does the browser asking first whether to open it, at once
// (Chrome's question does so within a tenth of a second of the click). With
// nothing on the computer claiming pocket-hub:, Chrome and Firefox do nothing
// at all and the page keeps the focus; a browser that says instead that it
// cannot open the link takes the focus only until that is read.
//
// So Hub did not open when the page has the focus `settle` after the click, or
// has it back before `back`: the visitor read the browser's word that it opened
// nothing, or said no to opening Hub. A page away longer is taken to be behind
// Hub. A visitor back from Hub that soon would be asked whether they have Hub
// yet, which is why `back` is short, and why what the page says is a question.

/** How long the click has to take the visitor away, and to keep them away. */
export const HAND_OFF = { settle: 2500, back: 8000 };

/** What the watch needs of the page: whether it has the focus, and word when it gets it back. */
export interface Attention {
  hasFocus(): boolean;
  /** Where "focus" is dispatched when the page gets the focus back. */
  events: EventTarget;
}

const thisPage = (): Attention => ({ hasFocus: () => document.hasFocus(), events: window });

/** Watches what came of a click on the link into Hub, and calls `missing`
 *  once if nothing took it. Returns what stops the watch. */
export function watchHandOff(missing: () => void, page: Attention = thisPage(), timing = HAND_OFF): () => void {
  const look = () => {
    if (!page.hasFocus()) return;
    stop();
    missing();
  };
  const settled = setTimeout(look, timing.settle);
  const gone = setTimeout(() => stop(), timing.back);
  page.events.addEventListener("focus", look);
  function stop() {
    clearTimeout(settled);
    clearTimeout(gone);
    page.events.removeEventListener("focus", look);
  }
  return stop;
}
