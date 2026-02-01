import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, decodeToken } from './jwt';

describe('JWT Utils', () => {
  const testPayload = {
    userId: 'user-123',
    githubId: 12345,
    login: 'testuser',
  };

  describe('signToken', () => {
    it('creates a valid JWT', () => {
      const token = signToken(testPayload);

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('creates different tokens for different payloads', () => {
      const token1 = signToken(testPayload);
      const token2 = signToken({ ...testPayload, userId: 'user-456' });

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('verifies a valid token', () => {
      const token = signToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.githubId).toBe(testPayload.githubId);
      expect(decoded?.login).toBe(testPayload.login);
    });

    it('returns null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('returns null for tampered token', () => {
      const token = signToken(testPayload);
      const tampered = token.slice(0, -5) + 'XXXXX';

      const decoded = verifyToken(tampered);
      expect(decoded).toBeNull();
    });

    it('includes iat and exp claims', () => {
      const token = signToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded!.exp).toBeGreaterThan(decoded!.iat);
    });
  });

  describe('decodeToken', () => {
    it('decodes without verification', () => {
      const token = signToken(testPayload);
      const decoded = decodeToken(token);

      expect(decoded?.userId).toBe(testPayload.userId);
    });

    it('returns null for invalid format', () => {
      const decoded = decodeToken('not-a-jwt');
      expect(decoded).toBeNull();
    });
  });
});
