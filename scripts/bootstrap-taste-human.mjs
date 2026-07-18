import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const root = dirname(dirname(__filename));
const cli = join(root, 'bin', 'sv-playbook.js');

function run(args) {
  console.log(`> sv-playbook ${args.join(' ')}`);
  execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
}

// Ensure taste-human has a distinct precedence rank above the legacy human-taste kind.
run([
  'context', 'precedence',
  'principle', 'human-decision', 'constitutional-invariant', 'binding-decision',
  'role-constraint', 'task-requirement', 'taste-human', 'human-taste',
  'instance-default', 'learned-correction', 'role',
]);

// Strength mapping (from content/taste/human.md Delivery column to CONTEXT_ITEM_STRENGTH):
//   core     -> mandatory  (applies to every run for the listed roles)
//   scoped   -> advisory   (included only when selectors match)
//   reference -> reference (id/summary by default; full text on demand)
//   compiler -> skip       (consumed by context/check machinery, not agent packs)
//
// RUNTIME-DESIGN is not a dispatchable role. Entries that include it alongside real
// roles are tagged `runtime-design-input` so runtime-design reviewers can discover them,
// while the role selector still limits the entry to the executable roles.

const BODY_FILE = 'content/taste/human.md';
const PROVENANCE = 'content/taste/human.md, bootstrap 2026-07-17';
const KIND = 'taste-human';
// This script was authored as a v3 correction on a store that already contained a v2
// bootstrap with incomplete phase selectors. On a completely fresh store, change VERSION
// to '1' and remove the --supersedes argument below.
const VERSION = '3';

const entries = [
  {
    // content/taste/human.md lists HJ-001 delivery as "scoped", so the strength is advisory.
    // The plan's example called it "core"; that was an approximation.
    id: 'HJ-001', heading: 'HJ-001: Optimize for irreducible human attention',
    semanticKey: 'hj-optimize-irreducible-human-attention', strength: 'advisory',
    roles: ['human-interface', 'planner', 'delivery-orchestrator'],
    phases: ['intake', 'planning', 'delivery', 'reporting', 'product-ux'],
    tags: ['human-attention'],
  },
  {
    id: 'HJ-002', heading: 'HJ-002: Mechanize every deterministic responsibility',
    semanticKey: 'hj-mechanize-deterministic-responsibility', strength: 'mandatory',
    roles: [], phases: [], tags: ['responsibility'],
  },
  {
    id: 'HJ-003', heading: 'HJ-003: Give agents only semantic residue',
    semanticKey: 'hj-give-agents-semantic-residue', strength: 'mandatory',
    roles: [], phases: [], tags: ['responsibility'],
  },
  {
    id: 'HJ-004', heading: 'HJ-004: Keep authority explicit and minimal',
    semanticKey: 'hj-keep-authority-explicit-minimal', strength: 'mandatory',
    roles: [], phases: [], tags: ['authority'],
  },
  {
    id: 'HJ-005', heading: 'HJ-005: Make provider sessions disposable',
    semanticKey: 'hj-make-provider-sessions-disposable', strength: 'advisory',
    roles: ['human-interface', 'advisor', 'planner', 'refuter', 'delivery-orchestrator'],
    phases: ['startup', 'sourcing', 'architecture', 'dispatch'], tags: ['portability', 'sourcing'],
  },
  {
    id: 'HJ-006', heading: 'HJ-006: Compile the minimum sufficient context',
    semanticKey: 'hj-compile-minimum-sufficient-context', strength: 'mandatory',
    roles: [], phases: ['startup', 'handoff', 'resume', 'reporting'], tags: ['context', 'handoff'],
  },
  {
    id: 'HJ-007', heading: 'HJ-007: Be severe about reasoning, proportional about ceremony',
    semanticKey: 'hj-severe-reasoning-proportional-ceremony', strength: 'advisory',
    roles: ['advisor', 'planner', 'refuter', 'arbiter', 'delivery-orchestrator', 'investigator', 'reviewer'],
    phases: ['decision', 'planning', 'diagnosis', 'review'], tags: ['reasoning-quality'],
  },
  {
    id: 'HJ-008', heading: 'HJ-008: Explain plainly',
    semanticKey: 'hj-explain-plainly', strength: 'advisory',
    roles: ['human-interface', 'advisor', 'planner', 'arbiter', 'delivery-orchestrator'],
    phases: ['human-facing-output', 'explanations', 'recommendations'], tags: ['human-communication'],
  },
  {
    id: 'HJ-009', heading: 'HJ-009: Tell the truth about maturity',
    semanticKey: 'hj-tell-truth-about-maturity', strength: 'mandatory',
    roles: [], phases: ['claims', 'reports', 'decisions', 'capability-use'], tags: ['evidence', 'honesty'],
  },
  {
    id: 'HJ-010', heading: 'HJ-010: Learn from failures and successes',
    semanticKey: 'hj-learn-from-failures-successes', strength: 'mandatory',
    roles: [], phases: ['retry', 'correction', 'escalation', 'retrospective'], tags: ['correction', 'learning'],
  },
  {
    id: 'HJ-011', heading: 'HJ-011: Observe without flooding context',
    semanticKey: 'hj-observe-without-flooding-context', strength: 'advisory',
    roles: ['human-interface', 'delivery-orchestrator', 'investigator'],
    phases: ['monitoring', 'diagnosis', 'runtime-ui-work'], tags: ['observability', 'runtime-design-input'],
  },
  {
    id: 'HJ-012', heading: 'HJ-012: Prefer root-cause closure over local patches',
    semanticKey: 'hj-prefer-root-cause-closure', strength: 'advisory',
    roles: ['planner', 'refuter', 'delivery-orchestrator', 'investigator', 'implementer', 'reviewer'],
    phases: ['architecture', 'debugging', 'implementation', 'review'], tags: ['engineering-strategy'],
  },
  {
    id: 'HJ-013', heading: 'HJ-013: Keep one source for each fact',
    semanticKey: 'hj-keep-one-source-per-fact', strength: 'advisory',
    roles: ['planner', 'refuter', 'implementer', 'reviewer'],
    phases: ['authoring', 'schemas', 'config', 'implementation', 'review'], tags: ['source-of-truth', 'runtime-design-input'],
  },
  {
    id: 'HJ-014', heading: 'HJ-014: Separate universal invariants from configurable opinion',
    semanticKey: 'hj-separate-invariants-from-opinion', strength: 'advisory',
    roles: ['human-interface', 'advisor', 'planner', 'refuter', 'arbiter', 'delivery-orchestrator'],
    phases: ['product', 'architecture', 'config', 'defaults'], tags: ['configuration-boundary', 'runtime-design-input'],
  },
  {
    id: 'HJ-015', heading: 'HJ-015: Make the human surface complete and low-friction',
    semanticKey: 'hj-human-surface-complete-low-friction', strength: 'advisory',
    roles: ['human-interface', 'advisor', 'planner', 'refuter'],
    phases: ['human-surface', 'ui', 'notifications', 'onboarding'], tags: ['product-ux', 'runtime-design-input'],
  },
  {
    id: 'HJ-016', heading: 'HJ-016: Review independently and adversarially',
    semanticKey: 'hj-review-independently-adversarially', strength: 'advisory',
    roles: ['planner', 'refuter', 'arbiter', 'delivery-orchestrator', 'implementer', 'reviewer'],
    phases: ['acceptance-authoring', 'refutation', 'review'], tags: ['review-quality'],
  },
  {
    id: 'HJ-017', heading: 'HJ-017: Preserve a fast private inner loop and a strict outer gate',
    semanticKey: 'hj-fast-inner-loop-strict-outer-gate', strength: 'advisory',
    roles: ['planner', 'delivery-orchestrator', 'implementer', 'reviewer'],
    phases: ['implementation', 'verification', 'promotion'], tags: ['delivery-loop', 'runtime-design-input'],
  },
  {
    id: 'HJ-018', heading: 'HJ-018: Human decision rule',
    semanticKey: 'hj-human-decision-rule', strength: 'mandatory',
    roles: ['human-interface', 'advisor', 'planner', 'refuter', 'arbiter', 'delivery-orchestrator'],
    phases: ['classification', 'routing', 'escalation'], tags: ['decision-routing'],
  },
  {
    id: 'HJ-019', heading: 'HJ-019: Explicit rejection patterns',
    semanticKey: 'hj-explicit-rejection-patterns', strength: 'reference',
    roles: [], phases: ['violation', 'authoring-check', 'incident', 'review'], tags: ['rejection-patterns'],
  },
  // HJ-020 has delivery mode "compiler" and is intentionally skipped.
  {
    id: 'HJ-021', heading: 'HJ-021: Unknowns must remain explicit',
    semanticKey: 'hj-unknowns-remain-explicit', strength: 'advisory',
    roles: ['human-interface', 'advisor', 'planner', 'refuter', 'arbiter', 'delivery-orchestrator', 'reviewer'],
    phases: ['inference', 'proposal', 'open-decision'], tags: ['uncertainty'],
  },
];

for (const entry of entries) {
  const args = [
    'context', 'add',
    '--id', entry.id,
    '--version', VERSION,
    '--kind', KIND,
    '--semantic-key', entry.semanticKey,
    '--body-file', BODY_FILE,
    '--heading', entry.heading,
    '--provenance', PROVENANCE,
    '--strength', entry.strength,
    '--supersedes', `${entry.id}@2`,
  ];
  for (const role of entry.roles) {
    args.push('--selector', `role=${role}`);
  }
  for (const phase of entry.phases) {
    args.push('--selector', `phase=${phase}`);
  }
  for (const tag of entry.tags) {
    args.push('--tag', tag);
  }
  run(args);
}

console.log('\n=== Verifying selective compilation ===');
run(['context', 'compile', '--role', 'human-interface', '--phase', 'intake']);
run(['context', 'compile', '--role', 'implementer', '--phase', 'implementation']);
