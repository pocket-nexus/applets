// The link the website's install button carries into Pocket Hub. Its grammar
// is Pocket Hub's docs/DEEP-LINKS.md §1, and Hub refuses anything outside it,
// so this holds the website to exactly that shape.
import { expect, test } from "bun:test";
import type { StoreApp } from "../site/src/api.ts";
import { hubInstallLink } from "../site/src/hub.ts";
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
