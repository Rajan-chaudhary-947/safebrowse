import { describe, expect, it } from 'vitest';
import { hashPin, validatePin, verifyPin } from '../src/common/auth';
import { validateBackup } from '../src/common/storage';

describe('SafeBrowse security and backup validation', () => {
  it('accepts only 4–8 digit parent PINs', () => {
    expect(() => validatePin('1234')).not.toThrow();
    expect(() => validatePin('12345678')).not.toThrow();
    expect(() => validatePin('123')).toThrow();
    expect(() => validatePin('123456789')).toThrow();
    expect(() => validatePin('12a4')).toThrow();
  });

  it('hashes and verifies PINs without storing the plaintext', async () => {
    const encoded = await hashPin('4821');
    expect(encoded).not.toContain('4821');
    expect(await verifyPin('4821', encoded)).toBe(true);
    expect(await verifyPin('4822', encoded)).toBe(false);
  });

  it('rejects malformed backup structures', () => {
    expect(validateBackup(null)).toBe(false);
    expect(validateBackup({ format: 'wrong', version: 2 })).toBe(false);
  });
});
