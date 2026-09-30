-- A Program can now exist without a Client, for teams that turn the Clients feature off
-- entirely and just want a standalone project/engagement tracker.
ALTER TABLE programs ALTER COLUMN client_id DROP NOT NULL;
