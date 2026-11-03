-- The OAuth relay of 0004 has no caller: omarchy-pocketd's spotify service
-- signs in with a pairing code (OAuth device authorization), which takes no
-- redirect URI, and the Worker answers no /oauth/<provider> route. Dropping
-- the table drops its index.
DROP TABLE IF EXISTS oauth_relay;
