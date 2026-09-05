import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  uniqueIndex,
  bigserial,
  index,
} from "drizzle-orm/pg-core";
import { user, organization } from "./auth-schema";
export * from "./auth-schema";
export const apiToken = pgTable("api_token", {
  id: text().primaryKey(),
  org_id: text()
    .notNull()
    .references(() => organization.id),
  user_id: text()
    .notNull()
    .references(() => user.id),
  name: text().notNull(),
  token_sha256: text().notNull().unique(),
  scopes: text().array().notNull(),
  created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  last_used_at: timestamp({ withTimezone: true }),
  revoked_at: timestamp({ withTimezone: true }),
});
export const invite = pgTable("invite", {
  id: text().primaryKey(),
  org_id: text()
    .notNull()
    .references(() => organization.id),
  email: text(),
  role: text().notNull(),
  token_sha256: text().notNull().unique(),
  expires_at: timestamp({ withTimezone: true }).notNull(),
  created_by: text()
    .notNull()
    .references(() => user.id),
  accepted_by: text().references(() => user.id),
  accepted_at: timestamp({ withTimezone: true }),
});
export const agentSession = pgTable(
  "agent_session",
  {
    id: text().primaryKey(),
    org_id: text()
      .notNull()
      .references(() => organization.id),
    owner_user_id: text()
      .notNull()
      .references(() => user.id),
    source: text().notNull(),
    external_id: text().notNull(),
    parent_session_id: text(),
    parent_external_id: text(),
    remote: text().notNull(),
    branch: text().notNull(),
    meta: jsonb().notNull(),
    started_at: timestamp({ withTimezone: true }).notNull(),
    last_activity_at: timestamp({ withTimezone: true }).notNull(),
    received_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completed: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex("session_identity").on(table.org_id, table.source, table.external_id),
    index("session_activity").on(table.org_id, table.last_activity_at),
  ],
);
export const agentMessage = pgTable(
  "agent_message",
  {
    session_id: text()
      .notNull()
      .references(() => agentSession.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    rev: integer().notNull(),
    kind: text().notNull(),
    text: text().notNull(),
    ts: timestamp({ withTimezone: true }).notNull(),
    hash: text().notNull(),
    data: jsonb().notNull(),
    received_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("message_sequence").on(table.session_id, table.seq)],
);
export const purgeTombstone = pgTable(
  "purge_tombstone",
  {
    org_id: text()
      .notNull()
      .references(() => organization.id),
    source: text().notNull(),
    external_id: text().notNull(),
    purged_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tombstone_identity").on(table.org_id, table.source, table.external_id)],
);
export const change = pgTable("change", {
  cursor: bigserial({ mode: "number" }).primaryKey(),
  org_id: text()
    .notNull()
    .references(() => organization.id),
  session_id: text().notNull(),
  seq: integer().notNull(),
  deleted: boolean().default(false).notNull(),
  received_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
export const bootstrap = pgTable("bootstrap", {
  id: integer().primaryKey(),
  org_id: text()
    .notNull()
    .references(() => organization.id),
});
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigserial("last_request", { mode: "number" }).notNull(),
});
