-- Every variant of a version's package: [{target, profile}] as JSON. A
-- package built for several devices is listed for each device's catalog.
ALTER TABLE versions ADD COLUMN variants TEXT NOT NULL DEFAULT '[]';
