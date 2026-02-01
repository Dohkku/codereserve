import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDb, type Database } from '@codereserve/db';
import { githubWebhookHandler } from './webhooks/github';
import { authRoutes } from './routes/auth';
import { repoRoutes } from './routes/repos';
import { depositRoutes } from './routes/deposits';
import { prRoutes } from './routes/prs';
import { createGitHubService, type GitHubService } from './services/github';
import { createBlockchainService, type BlockchainService } from './services/blockchain';
import { apiRateLimit } from './lib/rate-limit';
import type { AuthUser } from './lib/auth-middleware';

// Environment validation - CRITICAL: These must be set
const criticalEnvVars = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
];

// Additional critical vars for production
if (process.env.NODE_ENV === 'production') {
  criticalEnvVars.push('GITHUB_WEBHOOK_SECRET', 'FRONTEND_URL');
}

for (const envVar of criticalEnvVars) {
  if (!process.env[envVar]) {
    console.error(`CRITICAL: ${envVar} is not set. Server cannot start securely.`);
    process.exit(1);
  }
}

// Validate key lengths
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('CRITICAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
  console.error('CRITICAL: ENCRYPTION_KEY must be at least 32 characters');
  process.exit(1);
}

// Required env vars (warn only)
const requiredEnvVars = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'SIGNER_PRIVATE_KEY',
  'CONTRACT_ADDRESS',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set`);
  }
}

// Initialize services
const db = createDb(process.env.DATABASE_URL || 'file:./data/codereserve.db');
const githubService = createGitHubService();
const blockchainService = createBlockchainService();

// Context type for routes
type Env = {
  Variables: {
    db: Database;
    githubService: GitHubService;
    blockchainService: BlockchainService;
    user?: AuthUser;
  };
};

// Create Hono app
const app = new Hono<Env>();

// Middleware
app.use('*', logger());

// Security headers
app.use('*', async (c, next) => {
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
  }
  await next();
});

app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    exposeHeaders: ['Set-Cookie'],
  })
);

// Global rate limiting (100 requests per minute per IP)
app.use('/api/*', apiRateLimit);

// Inject services into context
app.use('*', async (c, next) => {
  c.set('db', db);
  c.set('githubService', githubService);
  c.set('blockchainService', blockchainService);
  await next();
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GitHub webhooks
app.post('/webhooks/github', githubWebhookHandler);

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/repos', repoRoutes);
app.route('/api/deposits', depositRoutes);
app.route('/api/prs', prRoutes);

// Error handling
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Not found
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting CodeReserve API on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

// Export types for routes
export type { Env as AppContext };
export default app;
