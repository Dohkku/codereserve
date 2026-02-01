import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export * from './schema';

// SQL to create all tables
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  login TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  wallet_address TEXT,
  access_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  treasury_address TEXT NOT NULL,
  risk_threshold INTEGER NOT NULL DEFAULT 60,
  deposit_amount TEXT NOT NULL DEFAULT '5000000',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL,
  repo_id TEXT NOT NULL REFERENCES repositories(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  deposit_required INTEGER NOT NULL,
  deposit_id TEXT,
  head_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  onchain_id TEXT,
  pr_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  repo_id TEXT NOT NULL REFERENCES repositories(id),
  amount TEXT NOT NULL,
  treasury_address TEXT NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  refund_tx_hash TEXT,
  slash_tx_hash TEXT,
  slash_reason TEXT,
  slashed_by_id TEXT REFERENCES users(id),
  slashed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_user_entries (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  reason TEXT,
  added_by_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL UNIQUE,
  account_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  access_token TEXT,
  token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  action TEXT,
  delivery_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);
`;

async function initializeTables(client: Client) {
  const statements = CREATE_TABLES_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await client.execute(statement);
  }
}

export function createDb(dbUrl: string = 'file:./data/codereserve.db') {
  const client = createClient({
    url: dbUrl,
  });

  // Initialize tables on startup
  initializeTables(client).catch(err => {
    console.error('Failed to initialize database tables:', err);
  });

  const db = drizzle(client, { schema });

  return db;
}

export type Database = ReturnType<typeof createDb>;
