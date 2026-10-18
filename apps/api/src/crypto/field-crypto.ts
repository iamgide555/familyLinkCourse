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
    const decode = (encoded: string): Buffer => {
      if (typeof encoded !== 'string') throw new Error('Invalid encrypted value');
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.toString('base64') !== encoded) throw new Error('Invalid encrypted value');
      return decoded;
    };
    const nonce = decode(value.nonce);
    const tag = decode(value.tag);
    const ciphertext = decode(value.ciphertext);
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
  /** Binary layout: version(1) | nonce(12) | tag(16) | ciphertext. */
  encryptBytes(plain: Buffer): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), ciphertext]);
  }
  decryptBytes(blob: Buffer): Buffer {
    if (blob.length < 29 || blob[0] !== 1) throw new Error('Unsupported encrypted file');
    const decipher = createDecipheriv('aes-256-gcm', this.key, blob.subarray(1, 13), { authTagLength: 16 });
    decipher.setAuthTag(blob.subarray(13, 29));
    return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]);
  }
  citizenIdIndex(orgId: string, normalizedId: string): string {
    return createHmac('sha256', this.indexKey)
      .update(JSON.stringify(['citizen-id', orgId, normalizedId]))
      .digest('hex');
  }
}
