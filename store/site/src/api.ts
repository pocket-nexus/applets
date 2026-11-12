// What the store answers under /v1 (store/src/index.ts), asked once a visit.
import type { PackageDescription, StoreEntry } from "../../src/wire.ts";

export type { PackageDescription, PackageVariant } from "../../src/wire.ts";
/** A listed version of an app. */
export type StoreApp = StoreEntry;

/** The store answered, and what was asked for is not listed in it. */
export class NotListed extends Error {}

const answers = new Map<string, Promise<unknown>>();

/** A route's JSON. A failed answer is forgotten, so the next ask tries again. */
function read<T>(path: string): Promise<T> {
  let answer = answers.get(path) as Promise<T> | undefined;
  if (!answer) {
    answer = fetch(path).then((response) => {
      if (response.status === 404) throw new NotListed(path);
      if (!response.ok) throw new Error(`${path} answered ${response.status}`);
      return response.json() as Promise<T>;
    });
    answers.set(path, answer);
    answer.catch(() => answers.delete(path));
  }
  return answer;
}

/** The newest listed version of every app, by title. */
export const listApps = () => read<{ apps: StoreApp[] }>("/v1/apps").then((answer) => answer.apps);

/** One app's newest listed version: out of the list when a page has already
 *  read it, else asked for by id. */
export async function findApp(id: string): Promise<StoreApp> {
  const listed = answers.get("/v1/apps") as Promise<{ apps: StoreApp[] }> | undefined;
  const known = listed && (await listed.catch(() => undefined))?.apps.find((app) => app.id === id);
  return known ?? read<StoreApp>(`/v1/apps/${encodeURIComponent(id)}`);
}

/** Every listed version of one app, newest first. */
export const listVersions = (id: string) =>
  read<{ versions: StoreApp[] }>(`/v1/apps/${encodeURIComponent(id)}/versions`).then((answer) => answer.versions);

/** A package's manifest and directory: what it asks of a device, and its builds. */
export const readManifest = (hash: string) => read<PackageDescription>(`/v1/manifests/${hash}`);

export const iconUrl = (app: StoreApp) => `/v1/icons/${app.icon}`;
export const packageUrl = (app: StoreApp) => `/v1/packages/${app.package}`;
export const packageName = (app: StoreApp) => `${app.id}-${app.version}.pocket`;
export const appPath = (app: StoreApp) => `/app/${encodeURIComponent(app.id)}`;
export const authorPath = (author: string) => `/author/${encodeURIComponent(author)}`;
