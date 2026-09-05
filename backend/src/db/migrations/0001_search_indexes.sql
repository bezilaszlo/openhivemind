CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE agent_message ADD COLUMN search tsvector GENERATED ALWAYS AS (to_tsvector('simple',text)) STORED;
--> statement-breakpoint
CREATE INDEX message_search ON agent_message USING gin(search);
--> statement-breakpoint
CREATE INDEX message_trigram ON agent_message USING gin(text gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX change_org_cursor ON change(org_id,cursor);
--> statement-breakpoint
CREATE UNIQUE INDEX member_identity ON auth.member(organization_id,user_id);
