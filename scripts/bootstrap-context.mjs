import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const root = dirname(__filename);

function run(script) {
  const path = join(root, script);
  console.log(`> node ${script}`);
  execFileSync(process.execPath, [path], { cwd: root, stdio: 'inherit' });
}

run('bootstrap-principles.mjs');
run('bootstrap-taste-human.mjs');
