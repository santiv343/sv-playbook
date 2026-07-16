import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  buildCommandSurface,
  inspectSuggestedCommands,
  inspectSuggestedCommandTree,
} from './suggested-command.js';
import { SUGGESTED_COMMAND_KIND } from './suggested-command.constants.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const CLI_SOURCES = [
  {
    path: 'src/cli/commands/promotion.ts',
    source: `const SUBCOMMANDS = new Map([
  ['run', { usage: 'sv-playbook promotion run --candidate <ID> --review-run <RUN-ID>', run: runPromotion }],
  ['list', { usage: 'sv-playbook promotion list', run: listPromotions }],
]);
export const command = { name: 'promotion', summary: 'x', run };`,
  },
  {
    path: 'src/cli/commands/docs.ts',
    source: `const META = { usage: 'sv-playbook docs [topic]' };
export const command = { name: 'docs', summary: 'x', run };`,
  },
  {
    path: 'src/cli/commands/task.ts',
    source: `const USAGE = 'sv-playbook task start --id <ID>';
const parsed = parseArgs({ args, options: { id: STRING_OPTION, force: { type: 'boolean' } } });
const GATE = { long: '--confirm-destructive' };
export const command = { name: 'task', summary: 'x', run };`,
  },
];

const SURFACE = buildCommandSurface(CLI_SOURCES);

test('surface mining reads names, subcommands, positionals and flags from declarations only', () => {
  assert.ok(SURFACE.names.has('promotion') && SURFACE.names.has('docs') && SURFACE.names.has('task'));
  assert.deepEqual([...SURFACE.subcommands.get('promotion') ?? []].sort(), ['list', 'run']);
  assert.ok(SURFACE.positionals.has('docs'));
  assert.ok(!SURFACE.positionals.has('promotion'));
  for (const flag of ['--candidate', '--review-run', '--id', '--force', '--confirm-destructive']) {
    assert.ok(SURFACE.flags.has(flag), `expected ${flag} in surface flags`);
  }
});

test('a suggestion message cannot whitelist itself', () => {
  assert.ok(!SURFACE.flags.has('--migrate-live'));
  assert.ok(!(SURFACE.subcommands.get('promotion') ?? new Set()).has('close'));
});

test('unknown command, subcommand and flag in TS messages are flagged with positions', () => {
  const source = `throw new UsageError('use \`sv-playbook promotion close\` to finish');
throw new UsageError('use \`sv-playbook promtion run\` to finish');
throw new UsageError('switch to main or pass --migrate-live');
throw new UsageError('use \`sv-playbook promotion run --candidate <ID>\` to finish');`;
  const inventory = inspectSuggestedCommands([{ path: 'src/example/messages.ts', source }], SURFACE);

  assert.deepEqual(inventory.violations.map(({ context, kind, line, value }) => ({ context, kind, line, value })), [
    {
      context: 'sv-playbook promotion close',
      kind: SUGGESTED_COMMAND_KIND.UNKNOWN_SUBCOMMAND,
      line: 1,
      value: 'promotion close',
    },
    {
      context: 'sv-playbook promtion run',
      kind: SUGGESTED_COMMAND_KIND.UNKNOWN_COMMAND,
      line: 2,
      value: 'promtion',
    },
    {
      context: 'switch to main or pass --migrate-live',
      kind: SUGGESTED_COMMAND_KIND.UNKNOWN_FLAG,
      line: 3,
      value: '--migrate-live',
    },
  ]);
  const lines = source.split('\n');
  for (const violation of inventory.violations) {
    const anchor = violation.kind === SUGGESTED_COMMAND_KIND.UNKNOWN_FLAG ? violation.value : 'sv-playbook';
    assert.equal(violation.column, (lines[violation.line - 1] ?? '').indexOf(anchor) + 1);
  }
});

test('positional commands accept any second token; non-positional commands do not', () => {
  const inventory = inspectSuggestedCommands([{
    path: 'src/example/more.ts',
    source: `const A = 'see \`sv-playbook docs principles\` for the rules';
const B = 'run \`sv-playbook promotion replay\` next';
const C = 'flags: \`sv-playbook task start --id BK-001\` and \`--confirm-destructive\`';`,
  }], SURFACE);

  assert.deepEqual(inventory.violations.map(({ kind, value }) => ({ kind, value })), [{
    kind: SUGGESTED_COMMAND_KIND.UNKNOWN_SUBCOMMAND,
    value: 'promotion replay',
  }]);
});

test('regex literals and comments are not scanned; template expressions are', () => {
  const inventory = inspectSuggestedCommands([{
    path: 'src/example/patterns.ts',
    source: 'const PATTERN = /sv-playbook\\s+fakerun/;\n// sv-playbook fakerun in a comment\nconst id = \'BK-001\';\nthrow new UsageError(`retry with \\`sv-playbook task restrt ${id}\\``);',
  }], SURFACE);

  assert.deepEqual(inventory.violations.map(({ kind, value }) => ({ kind, value })), [{
    kind: SUGGESTED_COMMAND_KIND.UNKNOWN_SUBCOMMAND,
    value: 'task restrt',
  }]);
});

test('markdown code spans and fenced blocks are scanned; prose is not', () => {
  const inventory = inspectSuggestedCommands([{
    path: 'docs/example.md',
    source: [
      'Run `sv-playbook promotion close` when done.',
      'Prose may discuss sv-playbook promotion close without backticks.',
      '',
      '```sh',
      'sv-playbook promotion run --candidate C-1',
      'git commit --amend',
      '```',
    ].join('\n'),
  }], SURFACE);

  assert.deepEqual(inventory.violations.map(({ kind, value }) => ({ kind, value })), [
    { kind: SUGGESTED_COMMAND_KIND.UNKNOWN_SUBCOMMAND, value: 'promotion close' },
    { kind: SUGGESTED_COMMAND_KIND.UNKNOWN_FLAG, value: '--amend' },
  ]);
});

test('living tree suggests only real commands, subcommands and flags', () => {
  const inventory = inspectSuggestedCommandTree(REPO_ROOT);
  assert.deepEqual(inventory.violations, []);
});
