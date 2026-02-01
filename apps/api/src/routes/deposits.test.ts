import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestApp,
  createTestUser,
  createTestRepo,
  createTestPR,
  createTestDeposit,
} from '../test/helpers';

describe('Deposits Routes', () => {
  describe('with write access', () => {
    let app: ReturnType<typeof createTestApp>['app'];
    let db: ReturnType<typeof createTestApp>['db'];

    beforeEach(() => {
      const testApp = createTestApp({ hasWriteAccess: true });
      app = testApp.app;
      db = testApp.db;
    });

    describe('GET /api/deposits/info', () => {
      it('returns deposit info for a PR', async () => {
        const { user } = await createTestUser(db);
        const repo = await createTestRepo(db, { fullName: 'org/repo' });
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          number: 42,
          riskScore: 75,
        });

        const res = await app.request('/api/deposits/info?repo=org/repo&pr=42');

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.prId).toBe(pr.id);
        expect(data.prNumber).toBe(42);
        expect(data.repoFullName).toBe('org/repo');
        expect(data.riskScore).toBe(75);
      });

      it('returns 400 without required params', async () => {
        const res = await app.request('/api/deposits/info');
        expect(res.status).toBe(400);
      });

      it('returns 404 for non-existent repo', async () => {
        const res = await app.request('/api/deposits/info?repo=org/nonexistent&pr=1');
        expect(res.status).toBe(404);
      });

      it('returns 404 for non-existent PR', async () => {
        await createTestRepo(db, { fullName: 'org/repo' });
        const res = await app.request('/api/deposits/info?repo=org/repo&pr=999');
        expect(res.status).toBe(404);
      });
    });

    describe('POST /api/deposits', () => {
      it('records a new deposit', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'pending_deposit',
        });

        const res = await app.request('/api/deposits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prId: pr.id,
            txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            onchainId: '1',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.depositId).toBeDefined();
      });

      it('returns 401 without auth', async () => {
        const res = await app.request('/api/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prId: 'some-id',
            txHash: '0x123',
            onchainId: '1',
          }),
        });

        expect(res.status).toBe(401);
      });

      it('returns 400 for duplicate deposit', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });

        // Create existing deposit
        await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
        });

        const res = await app.request('/api/deposits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prId: pr.id,
            txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            onchainId: '2',
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('GET /api/deposits/:id', () => {
      it('returns deposit details', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
        });

        const res = await app.request(`/api/deposits/${deposit.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.deposit.id).toBe(deposit.id);
      });

      it('returns 404 for non-existent deposit', async () => {
        const { token } = await createTestUser(db);
        const res = await app.request('/api/deposits/non-existent-uuid-id', {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(404);
      });

      it('returns 403 when accessing another user deposit', async () => {
        const { user } = await createTestUser(db);
        const { token: otherToken } = await createTestUser(db, { githubId: 99998, login: 'other' });
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
        });

        const res = await app.request(`/api/deposits/${deposit.id}`, {
          headers: { Authorization: `Bearer ${otherToken}` },
        });

        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/deposits/user/me', () => {
      it('returns deposits for authenticated user', async () => {
        const { user, token } = await createTestUser(db);
        const { user: otherUser } = await createTestUser(db, {
          githubId: 99999,
          login: 'otheruser',
        });
        const repo = await createTestRepo(db);
        const pr1 = await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 1 });
        const pr2 = await createTestPR(db, { repoId: repo.id, authorId: otherUser.id, number: 2 });

        await createTestDeposit(db, { prId: pr1.id, userId: user.id, repoId: repo.id });
        await createTestDeposit(db, { prId: pr2.id, userId: otherUser.id, repoId: repo.id });

        const res = await app.request('/api/deposits/user/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.deposits).toHaveLength(1);
      });
    });

    describe('POST /api/deposits/:id/refund', () => {
      it('generates refund signature for merged PR', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'merged',
        });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.signature).toBeDefined();
        expect(data.deadline).toBeDefined();
      });

      it('returns 400 for non-merged PR', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'open',
        });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
        });

        const res = await app.request(`/api/deposits/${deposit.id}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(400);
      });

      it('returns 403 when requesting refund for another user deposit', async () => {
        const { user } = await createTestUser(db);
        const { token: otherToken } = await createTestUser(db, { githubId: 99996, login: 'attacker2' });
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'merged',
        });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/refund`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${otherToken}` },
        });

        expect(res.status).toBe(403);
      });
    });

    describe('POST /api/deposits/:id/slash', () => {
      it('generates slash signature for maintainer with valid reason', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/slash`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'This PR contains spam links and promotional content',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.signature).toBeDefined();
      });

      it('returns 400 when no reason provided', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/slash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(400);
      });

      it('returns 400 when reason is too short', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/slash`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'spam' }),
        });

        expect(res.status).toBe(400);
      });

      it('returns 400 for already slashed deposit', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'slashed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/slash`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'This PR contains spam links and promotional content',
          }),
        });

        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/deposits/:id/confirm-refund', () => {
      it('confirms refund with tx hash', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/confirm-refund`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
      });

      it('returns 403 when confirming another user refund', async () => {
        const { user } = await createTestUser(db);
        const { token: otherToken } = await createTestUser(db, { githubId: 99997, login: 'attacker' });
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/confirm-refund`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${otherToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          }),
        });

        expect(res.status).toBe(403);
      });

      it('returns 400 for invalid tx hash format', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
        const deposit = await createTestDeposit(db, {
          prId: pr.id,
          userId: user.id,
          repoId: repo.id,
          status: 'confirmed',
        });

        const res = await app.request(`/api/deposits/${deposit.id}/confirm-refund`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ txHash: 'invalid-hash' }),
        });

        expect(res.status).toBe(400);
      });
    });
  });

  describe('without write access', () => {
    let app: ReturnType<typeof createTestApp>['app'];
    let db: ReturnType<typeof createTestApp>['db'];

    beforeEach(() => {
      const testApp = createTestApp({ hasWriteAccess: false });
      app = testApp.app;
      db = testApp.db;
    });

    it('returns 403 when slashing without write access', async () => {
      const { user, token } = await createTestUser(db);
      const repo = await createTestRepo(db);
      const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });
      const deposit = await createTestDeposit(db, {
        prId: pr.id,
        userId: user.id,
        repoId: repo.id,
        status: 'confirmed',
      });

      const res = await app.request(`/api/deposits/${deposit.id}/slash`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'This PR contains spam links and promotional content',
        }),
      });

      expect(res.status).toBe(403);
    });
  });
});
