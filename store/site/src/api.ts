// What the store answers under /v1 (store/src/index.ts). This is the one
// place the website asks it: a page or a component reads an app through
// here, and no route is named anywhere else.
import type { AppDetails, StoreEntry } from "../../src/wire.ts";

export type { AppDetails, Device, PackageVariant, Surface } from "../../src/wire.ts";
/** A listed version of an app. */
export type StoreApp = StoreEntry;

/** The store answered, and what was asked for is not listed in it. */
export class NotListed extends Error {}

/** A route's answer, when the store has one. */
async function ask(path: string): Promise<Response> {
  const response = await fetch(path);
  if (response.status === 404) throw new NotListed(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response;
}

const answers = new Map<string, Promise<unknown>>();

/** A route's JSON, asked once a visit. A failed answer is forgotten, so the next ask tries again. */
function read<T>(path: string): Promise<T> {
  let answer = answers.get(path) as Promise<T> | undefined;
  if (!answer) {
    answer = ask(path).then((response) => response.json() as Promise<T>);
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

/** A package's details: the devices it was built for and their builds, and
 *  what it asks of a device. The store reads them out of the package itself. */
export const readDetails = (hash: string) => read<AppDetails>(`/v1/details/${hash}`);

export const iconUrl = (app: StoreApp) => `/v1/icons/${app.icon}`;
export const packageUrl = (app: StoreApp) => `/v1/packages/${app.package}`;
export const packageName = (app: StoreApp) => `${app.id}-${app.version}.pocket`;
export const appPath = (app: StoreApp) => `/app/${encodeURIComponent(app.id)}`;
export const authorPath = (author: string) => `/author/${encodeURIComponent(author)}`;

// A version's whole files, for the player (components/AppPlayer.vue). They
// are not kept here as the answers above are: a hash names each for good, so
// the browser keeps them, and the player hands the package's bytes on to its
// frame.

/** A version's package. */
export const readPackage = (app: StoreApp) => ask(packageUrl(app)).then((response) => response.arrayBuffer());

/** A version's sample data; only a version that has some (`mock`) is asked for it. */
export const readMock = (app: StoreApp) => ask(`/v1/mocks/${app.mock}`).then((response) => response.json() as Promise<unknown>);
