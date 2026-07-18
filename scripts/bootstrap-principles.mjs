import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openStore, commonRoot } from '../dist/db/store.js';
import { addContextItem, loadContextCatalog, replaceContextPrecedence } from '../dist/context/repository.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../dist/context/context.constants.js';
import { readMarkdownSection } from '../dist/context/importers/markdown.js';

const __filename = fileURLToPath(import.meta.url);
const root = dirname(__filename);
const repoRoot = commonRoot(root);
const bodyFile = join(root, '..', 'AGENTS.md');
const provenance = 'AGENTS.md, bootstrap 2026-07-18';
const kind = 'principle';

const principles = [
  { id: 'PRINCIPLE-001', heading: 'PRINCIPLE-001 — Determinism first', semanticKey: 'principle-determinism-first' },
  { id: 'PRINCIPLE-002', heading: 'PRINCIPLE-002 — Spec-driven above, test-driven below', semanticKey: 'principle-spec-driven-test-driven' },
  { id: 'PRINCIPLE-003', heading: 'PRINCIPLE-003 — Nothing important lives only in a memory tool', semanticKey: 'principle-committed-source-of-truth' },
  { id: 'PRINCIPLE-004', heading: 'PRINCIPLE-004 — One source, N mirrors', semanticKey: 'principle-one-source-n-mirrors' },
  { id: 'PRINCIPLE-005', heading: 'PRINCIPLE-005 — Complexity budget is declared before code', semanticKey: 'principle-complexity-budget' },
  { id: 'PRINCIPLE-006', heading: 'PRINCIPLE-006 — Stopping is success', semanticKey: 'principle-stopping-is-success' },
  { id: 'PRINCIPLE-007', heading: 'PRINCIPLE-007 — Nothing dies without a tombstone', semanticKey: 'principle-tombstone' },
  { id: 'PRINCIPLE-008', heading: 'PRINCIPLE-008 — The methodology is not a second product', semanticKey: 'principle-methodology-not-product' },
  { id: 'PRINCIPLE-009', heading: 'PRINCIPLE-009 — Generated boilerplate, authored deltas', semanticKey: 'principle-generated-boilerplate-authored-deltas' },
  { id: 'PRINCIPLE-010', heading: 'PRINCIPLE-010 — No dead ends', semanticKey: 'principle-no-dead-ends' },
  { id: 'PRINCIPLE-011', heading: 'PRINCIPLE-011 — Single source for every fact', semanticKey: 'principle-single-source-every-fact' },
  { id: 'PRINCIPLE-012', heading: 'PRINCIPLE-012 — The CLI is the only interface', semanticKey: 'principle-cli-only-interface' },
  { id: 'PRINCIPLE-013', heading: 'PRINCIPLE-013 — Opinion-free core', semanticKey: 'principle-opinion-free-core' },
  { id: 'PRINCIPLE-014', heading: 'PRINCIPLE-014 — Quality is the operating mode', semanticKey: 'principle-quality-operating-mode' },
  { id: 'PRINCIPLE-015', heading: 'PRINCIPLE-015 — Subtraction has the same machinery as addition', semanticKey: 'principle-subtraction-machinery' },
];

const store = openStore(repoRoot);
try {
  // Precedence shared with bootstrap-taste-human.mjs. Must be set before any
  // addContextItem, because a kind with no rank poisons compilation.
  replaceContextPrecedence(store, [
    'principle', 'human-decision', 'constitutional-invariant', 'binding-decision',
    'role-constraint', 'task-requirement', 'taste-human', 'human-taste',
    'instance-default', 'learned-correction', 'role',
  ]);
  console.log('context precedence set');

  const catalog = loadContextCatalog(store);
  const activeRefs = new Set(
    catalog.items
      .filter((item) => item.kind === kind && item.status === CONTEXT_ITEM_STATUS.ACTIVE)
      .map((item) => item.id),
  );

  for (const principle of principles) {
    if (activeRefs.has(principle.id)) {
      console.log(`skip ${principle.id}: active ${kind} item already exists`);
      continue;
    }

    const body = readMarkdownSection(bodyFile, principle.heading);
    addContextItem(store, {
      id: principle.id,
      version: 1,
      kind,
      status: CONTEXT_ITEM_STATUS.ACTIVE,
      strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
      semanticKey: principle.semanticKey,
      body,
      provenance,
      tags: [],
      selectors: {},
      dependencies: [],
      supersedes: [],
      capabilities: {},
    });
    console.log(`added context ${principle.id}@1`);
  }
} finally {
  store.close();
}
