import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.enc$/i;
/** Encrypted file storage outside any web root; the API is the only reader. */
@Injectable()
export class FileStore {
  private readonly root: string;
  constructor(
    @Inject(APP_CONFIG) config: ApplicationConfig,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
  ) {
    this.root = resolve(config.documentStorePath ?? '.private/documents');
  }
  private path(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid file key');
    return join(this.root, key);
  }
  /** Absolute path of an encrypted blob; for tests and maintenance only. */
  locate(fileKey: EncryptedValue): string {
    return this.path(this.crypto.decrypt(fileKey));
  }
  async put(organizationId: string, bytes: Buffer): Promise<EncryptedValue> {
    const key = `${organizationId}/${randomUUID()}.enc`;
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid organization id for file storage');
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, this.crypto.encryptBytes(bytes), { mode: 0o600, flag: 'wx' });
    return this.crypto.encrypt(key);
  }
  async get(fileKey: EncryptedValue): Promise<Buffer> {
    return this.crypto.decryptBytes(await readFile(this.path(this.crypto.decrypt(fileKey))));
  }
  async remove(fileKey: EncryptedValue): Promise<void> {
    await rm(this.path(this.crypto.decrypt(fileKey)), { force: true });
  }
}
