// The stills `bun store/shots.ts` writes: an applet's first screen in the
// player, on its sample data. An applet has one when a file here is named by
// its id.
const files = import.meta.glob<string>("./assets/shots/*.webp", { eager: true, query: "?url", import: "default" });

const SHOTS = new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".webp".length), url]));

export const shotOf = (id: string): string | undefined => SHOTS.get(id);
