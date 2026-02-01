-- Migration: Add slash tracking fields to deposits table
-- For anti-abuse transparency: track who slashed and why

ALTER TABLE deposits ADD COLUMN slash_reason TEXT;
ALTER TABLE deposits ADD COLUMN slashed_by_id TEXT REFERENCES users(id);
ALTER TABLE deposits ADD COLUMN slashed_at INTEGER;
