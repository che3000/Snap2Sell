import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const drafts = sqliteTable(
  "drafts",
  {
    owner: text("owner").notNull(),
    id: text("id").notNull(),
    store: text("store").notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.id] }),
    index("drafts_owner_store").on(t.owner, t.store),
  ],
);
export const preferences = sqliteTable(
  "preferences",
  {
    owner: text("owner").notNull(),
    scope: text("scope").notNull(),
    data: text("data").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.scope] })],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    product: text("product").notNull(),
    scope: text("scope").notNull(),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("events_owner_scope_time").on(t.owner, t.scope, t.at)],
);
export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  product: text("product").notNull(),
  data: text("data").notNull(),
  at: integer("at").notNull(),
  observed: integer("observed").notNull().default(0),
});
export const credentials = sqliteTable("credentials", {
  owner: text("owner").primaryKey(),
  cipher: text("cipher").notNull(),
  model: text("model").notNull(),
  updated: integer("updated").notNull(),
});
export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("uploads_owner").on(t.owner)],
);
