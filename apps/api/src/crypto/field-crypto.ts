import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
export type EncryptedValue = { keyVersion: string; nonce: string; ciphertext: string; tag: string };
export class FieldCrypto {
  constructor(
    private readonly key: Buffer,
    private readonly indexKey: Buffer,
  ) {}
  encrypt(plain: string): EncryptedValue {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return {
      keyVersion: '1',
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  decrypt(value: EncryptedValue): string {
    if (value.keyVersion !== '1') throw new Error('Unsupported encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  citizenIdIndex(orgId: string, normalizedId: string): string {
    return createHmac('sha256', this.indexKey)
      .update(JSON.stringify(['citizen-id', orgId, normalizedId]))
      .digest('hex');
  }
}
