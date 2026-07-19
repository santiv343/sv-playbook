import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, commonRoot } from '../dist/db/store.js';
import { loadContextCatalog } from '../dist/context/repository.js';
import { CONTEXT_ITEM_STATUS } from '../dist/context/context.constants.js';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(__filename, '..', '..');

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

function renderFile(title, kind) {
  return (items) => {
    const active = items
      .filter((item) => item.kind === kind && item.status === CONTEXT_ITEM_STATUS.ACTIVE)
      .sort(byId)
      .map((item) => item.body.trimEnd());
    const lines = [
      '<!-- GENERATED FROM context_items — DO NOT EDIT -->',
      '',
      `# ${title}`,
      '',
      active.join('\n\n'),
    ];
    return lines.join('\n') + '\n';
  };
}

const projections = [
  {
    path: join(repoRoot, 'content', 'principles.md'),
    title: 'Principles',
    kind: 'principle',
  },
  {
    path: join(repoRoot, 'content', 'taste', 'human.md'),
    title: 'Human Judgment Profile',
    kind: 'taste-human',
  },
];

const store = openStore(commonRoot(repoRoot));
try {
  const catalog = loadContextCatalog(store);
  for (const projection of projections) {
    const content = renderFile(projection.title, projection.kind)(catalog.items);
    await writeFile(projection.path, content);
    console.log(`wrote ${projection.path}`);
  }
} finally {
  store.close();
}
