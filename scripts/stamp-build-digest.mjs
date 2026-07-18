import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const distRoot = 'dist';
const files = collectJsFiles(distRoot).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(readFileSync(file));
writeFileSync(join(distRoot, 'build-digest.json'), JSON.stringify({ digest: hash.digest('hex') }));
