import { beforeAll, afterAll, vi } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-min';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:3001';
process.env.GITHUB_APP_ID = 'test-app-id';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';
process.env.SIGNER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

beforeAll(() => {
  // Global setup
});

afterAll(() => {
  // Global cleanup
});
