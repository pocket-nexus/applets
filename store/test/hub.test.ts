// The link the website's install button carries into Pocket Hub, and what the
// page tells of where it went. The link's grammar is Pocket Hub's
// docs/DEEP-LINKS.md §1, and Hub refuses anything outside it, so this holds
// the website to exactly that shape.
import { describe, expect, test } from "bun:test";
import type { StoreApp } from "../site/src/api.ts";
import { hubInstallLink, watchHandOff } from "../site/src/hub.ts";
import { ID } from "../src/shared.ts";

const app = (id: string) => ({ id }) as StoreApp;

/** What Hub takes for a link: the scheme, the host `store`, `/app/` and an id of the store's shape. */
const LINK = new RegExp(`^pocket-hub://store/app/(${ID.source.slice(1, -1)})$`);

test("an app's link into Pocket Hub is its id under pocket-hub://store/app", () => {
  expect(hubInstallLink(app("dev.pocket-nexus.hn"))).toBe("pocket-hub://store/app/dev.pocket-nexus.hn");
  for (const id of ["dev.pocket-nexus.hn", "io.example.pixels", "a1.b2.c3.d4.e5.f6"]) {
    expect(ID.test(id)).toBe(true);
    expect(hubInstallLink(app(id)).match(LINK)?.[1]).toBe(id);
  }
});

test("an id outside the store's shape never reads as another app's link", () => {
  // Hub ignores a query and a fragment: unencoded, these would open dev.pocket-nexus.hn.
  for (const id of ["dev.pocket-nexus.hn?x=1", "dev.pocket-nexus.hn#top", "dev.pocket-nexus.hn/../x"]) {
    const link = hubInstallLink(app(id));
    expect(LINK.test(link)).toBe(false);
    expect(new URL(link).search + new URL(link).hash).toBe("");
    expect(new URL(link).pathname.split("/").length).toBe(3);
  }
});

// What came of a click on the link, told from the focus alone (hub.ts): a
// page that keeps it, or gets it back soon, was not taken into Hub.
describe("the watch on the hand-off", () => {
  const timing = { settle: 40, back: 160 };

  /** A page whose focus the test moves, and what the watch said of it. */
  function watched() {
    const page = { focused: true, hasFocus: () => page.focused, events: new EventTarget() };
    const said = { missing: 0 };
    const stop = watchHandOff(() => said.missing++, page, timing);
    return {
      said,
      stop,
      leave: () => (page.focused = false),
      come: () => {
        page.focused = true;
        page.events.dispatchEvent(new Event("focus"));
      },
    };
  }

  test("a page that keeps the focus says Hub did not open, once it has settled", async () => {
    const { said } = watched();
    await Bun.sleep(timing.settle / 2);
    expect(said.missing).toBe(0);
    await Bun.sleep(timing.back);
    expect(said.missing).toBe(1);
  });

  test("a page left for Hub, or for the browser asking, says nothing", async () => {
    const { said, leave } = watched();
    leave();
    await Bun.sleep(timing.back + timing.settle);
    expect(said.missing).toBe(0);
  });

  test("a page left and back before long says Hub did not open, then", async () => {
    const { said, leave, come } = watched();
    leave();
    await Bun.sleep(timing.settle + 20);
    expect(said.missing).toBe(0);
    come();
    expect(said.missing).toBe(1);
    come();
    await Bun.sleep(timing.back);
    expect(said.missing).toBe(1);
  });

  test("a page back after long, or a watch stopped, says nothing", async () => {
    const late = watched();
    late.leave();
    await Bun.sleep(timing.back + 20);
    late.come();
    expect(late.said.missing).toBe(0);

    const stopped = watched();
    stopped.stop();
    await Bun.sleep(timing.settle + 20);
    expect(stopped.said.missing).toBe(0);
  });
});
