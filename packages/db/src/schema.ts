// Postgres schema (Drizzle ORM). New to Porphyra — no upstream equivalent
// (the source project stores everything in flat markdown/TSV files; this is
// the from-scratch relational design described in the approved plan's "Data
// model" section).
//
// NOTE on `users`: Better Auth (Phase 2) owns and generates its own tables
// (`users`, `sessions`, `accounts`, `verifications`, `two_factor`) via its
// CLI — they are not hand-written here to avoid drifting from what the auth
// library actually expects. `usersPlaceholder` below exists only so this
// file's foreign keys type-check before Phase 2 runs `better-auth generate`;
// delete it and repoint the FKs at the generated table then.

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** @deprecated Placeholder only — replaced by Better Auth's generated `user` table in Phase 2. */
export const usersPlaceholder = pgTable("user", {
  id: text("id").primaryKey(),
});

/**
 * Pre-launch waitlist (Phase 1, apps/web's marketing site). Deliberately NOT
 * linked to `usersPlaceholder` — a waitlist signup precedes account
 * creation and most rows will never become a user. Email is stored in clear
 * (not vault content — no encryption story applies before there's an
 * account or a DEK to encrypt it with).
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    source: text("source"), // e.g. "marketing_home", "for_designers" — which page/segment
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("waitlist_entries_created_idx").on(table.createdAt)],
);

export const applicationStateEnum = pgEnum("application_state", [
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
  "hired",
]);

export const vaultItemTypeEnum = pgEnum("vault_item_type", [
  "cv",
  "report",
  "cover_letter",
  "interview_note",
  "contact",
  "jd",
  "provider_key",
]);

export const planTierEnum = pgEnum("plan_tier", ["free", "pro"]);

/**
 * Per-user key material. Only WRAPPED keys ever touch the server — see the
 * plan's Encryption design § Key hierarchy. `wrappedDek` and
 * `recoveryWrappedDek` are ciphertext; the server cannot unwrap either.
 */
export const userKeys = pgTable("user_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
  wrappedDek: text("wrapped_dek").notNull(), // AES-GCM(MK, DEK), base64
  encSalt: text("enc_salt").notNull(), // Argon2id salt for the Master Key
  recoveryWrappedDek: text("recovery_wrapped_dek").notNull(), // AES-GCM(RK, DEK), base64
  kdfParams: jsonb("kdf_params").notNull(), // { algo, memoryKb, iterations, parallelism }
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

/**
 * Encrypted content — CV, reports, cover letters, notes, contacts, raw JD
 * text, and any provider key the user brings themselves. `blindIndex` is an
 * HMAC over a normalized plaintext field (e.g. company name) so the server
 * can filter/dedupe without learning the value — see the plan's "Encrypted
 * vs. clear" split.
 */
export const vaultItems = pgTable(
  "vault_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
    type: vaultItemTypeEnum("type").notNull(),
    ciphertext: text("ciphertext").notNull(), // base64
    iv: text("iv").notNull(), // base64, unique per record
    blindIndex: text("blind_index"), // nullable — not every item type needs one
    applicationId: uuid("application_id"), // FK added once `applications` exists below
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vault_items_user_idx").on(table.userId),
    index("vault_items_blind_index_idx").on(table.blindIndex),
  ],
);

/**
 * Application tracker. Metadata stays CLEAR (drives the funnel/analytics
 * queries directly); the report/notes/JD content lives encrypted in
 * `vault_items` and is linked, not embedded.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
    companyBlindIndex: text("company_blind_index").notNull(),
    roleBlindIndex: text("role_blind_index").notNull(),
    state: applicationStateEnum("state").notNull().default("evaluated"),
    score: numeric("score", { precision: 3, scale: 2 }), // 0.00–5.00
    legitimacyTier: text("legitimacy_tier"),
    atsVendor: text("ats_vendor"), // greenhouse | lever | ashby | workday | ... — clear, not sensitive
    sourcePortal: text("source_portal"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("applications_user_idx").on(table.userId),
    index("applications_state_idx").on(table.state),
  ],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  tier: planTierEnum("tier").notNull().default("free"),
  status: text("status").notNull().default("active"), // mirrors Stripe's subscription.status
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly rolling usage against the plan's AI-evaluation quota. */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    evaluationsUsed: integer("evaluations_used").notNull().default(0),
    aiCostUsd: numeric("ai_cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  },
  (table) => [index("usage_counters_user_period_idx").on(table.userId, table.periodStart)],
);

/**
 * Behavioural analytics only — see the plan's E2EE-vs-analytics resolution.
 * `props` must never contain vault content; enforced in the event-emission
 * helper (Phase 5), not just by convention here.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => usersPlaceholder.id, { onDelete: "set null" }),
    sessionId: text("session_id"),
    name: text("name").notNull(), // e.g. "evaluation_started", "checkout_completed"
    props: jsonb("props").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_name_idx").on(table.name),
    index("events_user_idx").on(table.userId),
  ],
);

/** Append-only. Nothing ever updates or deletes a row here except the
 * account-deletion retention job, and that's logged in its own row first. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => usersPlaceholder.id, { onDelete: "set null" }),
  action: text("action").notNull(), // "login", "password_change", "key_rotation", "export", ...
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiJobStatusEnum = pgEnum("ai_job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);

/** Queue state for the consented AI evaluation path. `costUsd` feeds
 * `usage_counters` and the admin cost dashboard (Phase 5). Payloads are
 * NEVER persisted here — only token counts and cost, after the fact. */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersPlaceholder.id, { onDelete: "cascade" }),
    status: aiJobStatusEnum("status").notNull().default("queued"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("ai_jobs_user_idx").on(table.userId),
    index("ai_jobs_status_idx").on(table.status),
  ],
);
