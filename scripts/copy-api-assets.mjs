import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist/api/apps/api');
await mkdir(join(output, 'src/forms'), { recursive: true });
for (const name of ['templates', 'assets']) {
  await cp(join(root, 'apps/api/src/forms', name), join(output, 'src/forms', name), { recursive: true });
}
await cp(join(root, 'apps/api/package.json'), join(output, 'package.json'));
