// The shapes of what /v1/* answers, with nothing else in the file: the Worker
// (index.ts) makes them, and the website (store/site) and anything else that
// shows the store's apps read them.

/** A listed version as /v1/catalog and /v1/apps answer it: what a device and
 *  the website (store/site) read. */
export interface StoreEntry {
  id: string;
  version: string;
  title: string;
  summary: string;
  author: string;
  /** The publisher's ed25519 public key, base64url. */
  key: string;
  /** Published by the official key. */
  official: boolean;
  services: string[];
  hosts: string[];
  /** The first variant's profile hash and target id. */
  profile: string;
  target: string;
  /** The targets of every variant: the devices it runs on. */
  targets: string[];
  /** SHA-256 of the package and of the icon, hex: their names under /v1/packages and /v1/icons. */
  package: string;
  icon: string;
  bytes: number;
  signature: string;
  /** When it was published, ms since the epoch. */
  created: number;
  /** SHA-256 of its sample data under /v1/mocks, when it has some. */
  mock: string | null;
}

export interface PackageVariant {
  target: string;
  hostAbi: number;
  /** SHA-256 of the build profile, hex */
  profile: string;
  /** FNV-1a64 of the sections' payloads, hex */
  hash: string;
  sections: { kind: number; name: string; bytes: number }[];
}

export interface PackageDescription {
  manifest: Record<string, unknown>;
  variants: PackageVariant[];
}

/** A device a package was built for. */
export interface Device {
  /** The target id its variant names: rg-ds-plus. */
  target: string;
  /** The device's name, or the target id of one the store has no name for. */
  name: string;
  /** Its build in the package. /v1/details always has it; a list of devices
   *  made from a listing's `targets` alone (details.ts devicesOf) does not. */
  build?: PackageVariant;
}

/** The surface an app lays itself out for. */
export interface Surface {
  /** A touch surface of its own, not the device's screen. */
  touch: boolean;
  /** The sizes it is laid out for, [width, height] in points, when it names both. */
  size?: { min: number[]; max: number[] };
}

/** A package's details as /v1/details answers them: what its manifest and
 *  directory say, read out by the store (details.ts) so that whoever shows
 *  an app reads no manifest of its own. */
export interface AppDetails {
  /** The devices it was built for, in the order the store names devices; one it has no name for comes last. */
  devices: Device[];
  /** The capabilities it needs of a device (PocketJS contracts/spec/applet.ts), by id. */
  needs: string[];
  /** The ones it uses where a device has them. */
  uses: string[];
  /** Absent when the package names no surface. */
  surface?: Surface;
  framework?: string;
  /** The applet API's version. */
  api?: number;
}
