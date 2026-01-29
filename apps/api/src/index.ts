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

// Environment validation
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
  };
};

// Create Hono app
const app = new Hono<Env>();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

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
