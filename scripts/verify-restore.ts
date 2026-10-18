import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../apps/api/src/config/config.js';
import { FieldCrypto, type EncryptedValue } from '../apps/api/src/crypto/field-crypto.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';

/**
 * After a restore rehearsal: prove the recovered keys really open the recovered data.
 * Reads the staging database and uploads folder only. Configure it with the STAGING database URL, the keys fetched
 * from the password manager or sealed copy, and DOCUMENT_STORE_PATH pointing at the restored uploads.
 */
async function main(): Promise<void> {
  const config = loadConfig({ ...process.env, NODE_ENV: 'development', DEV_IDENTITY_ENABLED: 'false' });
  const db = new PrismaService(config);
  const crypto = new FieldCrypto(config.encryptionKey, config.blindIndexKey);
  const failures: string[] = [];
  const check = async (label: string, run: () => Promise<string>) => {
    try { console.log(`ok   ${label}: ${await run()}`); } catch (error) { failures.push(label); console.error(`FAIL ${label}: ${error instanceof Error ? error.message : 'error'}`); }
  };
  try {
    await check('member intake decrypts', async () => {
      const m = await db.member.findFirst({ where: { intakeEncrypted: { not: undefined } as never } });
      if (!m?.intakeEncrypted) return 'no member with intake data to sample';
      JSON.parse(crypto.decrypt(m.intakeEncrypted as EncryptedValue));
      return `member ${m.memberNumber ?? m.id.slice(0, 8)}`;
    });
    await check('case note revision decrypts', async () => {
      const r = await db.caseNoteRevision.findFirst();
      if (!r) return 'no revisions to sample';
      crypto.decrypt(r.bodyEncrypted as EncryptedValue);
      return `version ${r.version}`;
    });
    await check('registration snapshot decrypts', async () => {
      const r = await db.registrationSnapshot.findFirst();
      if (!r) return 'no snapshots to sample';
      JSON.parse(crypto.decrypt(r.snapshotEncrypted as EncryptedValue));
      return `version ${r.version}`;
    });
    await check('uploaded file decrypts', async () => {
      const doc = await db.memberDocument.findFirst({ where: { deletedAt: null } });
      if (!doc) return 'no documents to sample';
      const key = crypto.decrypt(doc.fileKeyEncrypted as EncryptedValue);
      const bytes = crypto.decryptBytes(await readFile(join(config.documentStorePath ?? '', key)));
      return `${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;
    });
    await check('every stored file is present', async () => {
      const docs = await db.memberDocument.findMany({ where: { deletedAt: null } });
      const present = new Set<string>();
      for (const org of await readdir(config.documentStorePath ?? '.').catch(() => [])) for (const f of await readdir(join(config.documentStorePath ?? '.', org)).catch(() => [])) present.add(`${org}/${f}`);
      const missing = docs.filter((d) => !present.has(crypto.decrypt(d.fileKeyEncrypted as EncryptedValue)));
      if (missing.length) throw new Error(`${missing.length} of ${docs.length} files missing`);
      return `${docs.length} files`;
    });
  } finally { await db.$disconnect(); }
  if (failures.length) { console.error(`Restore verification FAILED: ${failures.join(', ')}`); process.exit(1); }
  console.log('Restore verification passed.');
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
