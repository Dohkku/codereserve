import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ============================================
// Users (GitHub accounts)
// ============================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  login: text('login').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  walletAddress: text('wallet_address'),
  accessToken: text('access_token'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Repositories (repos with CodeReserve installed)
// ============================================

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull().unique(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  installationId: integer('installation_id').notNull(),
  treasuryAddress: text('treasury_address').notNull(),
  riskThreshold: integer('risk_threshold').notNull().default(60),
  depositAmount: text('deposit_amount').notNull().default('5000000'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Pull Requests
// ============================================

export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  githubId: integer('github_id').notNull(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  authorId: text('author_id').notNull().references(() => users.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  state: text('state', {
    enum: ['open', 'closed', 'merged', 'pending_deposit']
  }).notNull(),
  riskScore: integer('risk_score').notNull(),
  depositRequired: integer('deposit_required', { mode: 'boolean' }).notNull(),
  depositId: text('deposit_id'),
  headSha: text('head_sha').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Deposits (on-chain escrow deposits)
// ============================================

export const deposits = sqliteTable('deposits', {
  id: text('id').primaryKey(),
  onchainId: text('onchain_id'),
  prId: text('pr_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  amount: text('amount').notNull(),
  treasuryAddress: text('treasury_address').notNull(),
  txHash: text('tx_hash'),
  status: text('status', {
    enum: ['pending', 'confirmed', 'refunded', 'slashed', 'expired']
  }).notNull().default('pending'),
  refundTxHash: text('refund_tx_hash'),
  slashTxHash: text('slash_tx_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Whitelist/Blacklist entries
// ============================================

export const repoUserEntries = sqliteTable('repo_user_entries', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repositories.id),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type', { enum: ['whitelist', 'blacklist'] }).notNull(),
  reason: text('reason'),
  addedById: text('added_by_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// GitHub App Installations
// ============================================

export const installations = sqliteTable('installations', {
  id: text('id').primaryKey(),
  installationId: integer('installation_id').notNull().unique(),
  accountId: integer('account_id').notNull(),
  accountLogin: text('account_login').notNull(),
  accountType: text('account_type', { enum: ['User', 'Organization'] }).notNull(),
  targetType: text('target_type').notNull(),
  accessToken: text('access_token'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Webhook Events Log (for debugging)
// ============================================

export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  action: text('action'),
  deliveryId: text('delivery_id').notNull().unique(),
  payload: text('payload').notNull(),
  processed: integer('processed', { mode: 'boolean' }).notNull().default(false),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================
// Relations (defined separately to avoid circular issues)
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  pullRequests: many(pullRequests),
  deposits: many(deposits),
  repoUserEntries: many(repoUserEntries),
}));

export const repositoriesRelations = relations(repositories, ({ many }) => ({
  pullRequests: many(pullRequests),
  deposits: many(deposits),
  repoUserEntries: many(repoUserEntries),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repoId],
    references: [repositories.id],
  }),
  author: one(users, {
    fields: [pullRequests.authorId],
    references: [users.id],
  }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  user: one(users, {
    fields: [deposits.userId],
    references: [users.id],
  }),
  repository: one(repositories, {
    fields: [deposits.repoId],
    references: [repositories.id],
  }),
}));

export const repoUserEntriesRelations = relations(repoUserEntries, ({ one }) => ({
  repository: one(repositories, {
    fields: [repoUserEntries.repoId],
    references: [repositories.id],
  }),
  user: one(users, {
    fields: [repoUserEntries.userId],
    references: [users.id],
  }),
  addedBy: one(users, {
    fields: [repoUserEntries.addedById],
    references: [users.id],
  }),
}));

// ============================================
// Type exports for use in application
// ============================================

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Repository = InferSelectModel<typeof repositories>;
export type NewRepository = InferInsertModel<typeof repositories>;

export type PullRequest = InferSelectModel<typeof pullRequests>;
export type NewPullRequest = InferInsertModel<typeof pullRequests>;

export type Deposit = InferSelectModel<typeof deposits>;
export type NewDeposit = InferInsertModel<typeof deposits>;

export type RepoUserEntry = InferSelectModel<typeof repoUserEntries>;
export type NewRepoUserEntry = InferInsertModel<typeof repoUserEntries>;

export type Installation = InferSelectModel<typeof installations>;
export type NewInstallation = InferInsertModel<typeof installations>;

export type WebhookEvent = InferSelectModel<typeof webhookEvents>;
export type NewWebhookEvent = InferInsertModel<typeof webhookEvents>;
