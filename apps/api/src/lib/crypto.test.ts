import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

describe('Crypto Utils', () => {
  describe('encrypt/decrypt', () => {
    it('encrypts and decrypts a string correctly', () => {
      const plaintext = 'my-secret-github-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'my-secret-github-token';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('handles empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('handles unicode characters', () => {
      const plaintext = 'Hello 世界 🚀';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('handles long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('throws on tampered ciphertext', () => {
      const plaintext = 'my-secret';
      const encrypted = encrypt(plaintext);

      // Tamper with the ciphertext
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
