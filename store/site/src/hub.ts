// Installing is Pocket Hub's work, not this page's: the page hands Hub the
// app, and Hub decides whether a device can run it and installs it. That
// hand-off is not open yet, so there is no link to give and the install button
// (components/InstallButton.vue) says so. When it opens, this is the one
// place that changes.
import type { StoreApp } from "./api.ts";

/** The link that opens Pocket Hub on this app, or null while there is none. */
export function hubInstallLink(_app: StoreApp): string | null {
  return null;
}
