// The shapes of what /v1/* answers, with nothing else in the file: the Worker
// (index.ts) makes them and the website (store/site) reads them.

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
