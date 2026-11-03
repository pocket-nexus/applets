-- The OAuth relay: a device that cannot open a browser shows the sign-in
-- page's URL as a QR code; the provider sends the phone back to
-- /oauth/<provider> with a code and the device's state, kept here until the
-- device takes it once (at most RELAY_TTL_MS).
CREATE TABLE oauth_relay (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE INDEX oauth_relay_created ON oauth_relay (created);
