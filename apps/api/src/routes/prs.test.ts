import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createTestUser, createTestRepo, createTestPR } from '../test/helpers';

describe('PRs Routes', () => {
  describe('with write access', () => {
    let app: ReturnType<typeof createTestApp>['app'];
    let db: ReturnType<typeof createTestApp>['db'];

    beforeEach(() => {
      const testApp = createTestApp({ hasWriteAccess: true });
      app = testApp.app;
      db = testApp.db;
    });

    describe('GET /api/prs', () => {
      it('returns 401 without auth', async () => {
        const res = await app.request('/api/prs');
        expect(res.status).toBe(401);
      });

      it('returns pull requests list', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 1 });
        await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 2 });

        const res = await app.request('/api/prs', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pullRequests).toHaveLength(2);
      });

      it('filters by repoId', async () => {
        const { user, token } = await createTestUser(db);
        const repo1 = await createTestRepo(db, { githubId: 1, fullName: 'org/repo1' });
        const repo2 = await createTestRepo(db, { githubId: 2, fullName: 'org/repo2' });
        await createTestPR(db, { repoId: repo1.id, authorId: user.id, number: 1 });
        await createTestPR(db, { repoId: repo2.id, authorId: user.id, number: 2 });

        const res = await app.request(`/api/prs?repoId=${repo1.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pullRequests).toHaveLength(1);
      });
    });

    describe('GET /api/prs/:id', () => {
      it('returns PR details', async () => {
        const { user } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          title: 'Test Pull Request',
        });

        const res = await app.request(`/api/prs/${pr.id}`);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pullRequest.id).toBe(pr.id);
        expect(data.pullRequest.title).toBe('Test Pull Request');
      });

      it('returns 404 for non-existent PR', async () => {
        const res = await app.request('/api/prs/non-existent');
        expect(res.status).toBe(404);
      });
    });

    describe('GET /api/prs/user/me', () => {
      it('returns PRs for authenticated user', async () => {
        const { user, token } = await createTestUser(db);
        const { user: otherUser } = await createTestUser(db, {
          githubId: 99999,
          login: 'otheruser',
        });
        const repo = await createTestRepo(db);

        // Create PRs for both users
        await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 1 });
        await createTestPR(db, { repoId: repo.id, authorId: user.id, number: 2 });
        await createTestPR(db, { repoId: repo.id, authorId: otherUser.id, number: 3 });

        const res = await app.request('/api/prs/user/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.pullRequests).toHaveLength(2);
      });
    });

    describe('POST /api/prs/:id/mark-spam', () => {
      it('marks PR as spam', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'open',
        });

        const res = await app.request(`/api/prs/${pr.id}/mark-spam`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
      });

      it('returns 401 without auth', async () => {
        const { user } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });

        const res = await app.request(`/api/prs/${pr.id}/mark-spam`, {
          method: 'POST',
        });

        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/prs/:id/approve', () => {
      it('approves a PR', async () => {
        const { user, token } = await createTestUser(db);
        const repo = await createTestRepo(db);
        const pr = await createTestPR(db, {
          repoId: repo.id,
          authorId: user.id,
          state: 'pending_deposit',
          depositRequired: true,
        });

        const res = await app.request(`/api/prs/${pr.id}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
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

    it('returns 403 when marking spam without write access', async () => {
      const { user, token } = await createTestUser(db);
      const repo = await createTestRepo(db);
      const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });

      const res = await app.request(`/api/prs/${pr.id}/mark-spam`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });

    it('returns 403 when approving without write access', async () => {
      const { user, token } = await createTestUser(db);
      const repo = await createTestRepo(db);
      const pr = await createTestPR(db, { repoId: repo.id, authorId: user.id });

      const res = await app.request(`/api/prs/${pr.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(403);
    });
  });
});
