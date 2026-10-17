import { FieldCrypto } from '../src/crypto/field-crypto.js';

// Catches unauthenticated encryption, nonce reuse, plaintext storage and global blind indexes.
describe('sensitive field protection', () => {
  const crypto = new FieldCrypto(Buffer.alloc(32, 11), Buffer.alloc(32, 22));
  it('round trips Thai text without storing plaintext', () => {
    const encrypted = crypto.encrypt('ข้อมูลตัวอย่างเท่านั้น');
    expect(JSON.stringify(encrypted)).not.toContain('ข้อมูลตัวอย่าง');
    expect(crypto.decrypt(encrypted)).toBe('ข้อมูลตัวอย่างเท่านั้น');
  });
  it('rejects ciphertext whose authenticated tag changed', () => {
    const encrypted = crypto.encrypt('sensitive');
    const tag = Buffer.from(encrypted.tag, 'base64');
    tag[0] ^= 1;
    expect(() => crypto.decrypt({ ...encrypted, tag: tag.toString('base64') })).toThrow();
  });
  it('uses different nonces for repeated identical values', () => {
    const first = crypto.encrypt('same');
    const second = crypto.encrypt('same');
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
  it('scopes deterministic citizen ID lookup to organization', () => {
    expect(crypto.citizenIdIndex('org-a', '1234567890123')).toBe(
      crypto.citizenIdIndex('org-a', '1234567890123'),
    );
    expect(crypto.citizenIdIndex('org-a', '1234567890123')).not.toBe(
      crypto.citizenIdIndex('org-b', '1234567890123'),
    );
  });
});
