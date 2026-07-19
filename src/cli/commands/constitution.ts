import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import type { Store } from '../../db/store.types.js';
import {
  setSection,
  getSection,
  listSections,
  addPrinciple,
  listPrinciples,
  regenerateExport,
} from '../../constitution/constitution.js';

const USAGE = [
  'Usage:',
  '  sv-playbook constitution set <section> --body-file <path>',
  '  sv-playbook constitution add-principle --rule <text> --rationale <text>',
  '  sv-playbook constitution show <section> [--json]',
  '  sv-playbook constitution list',
].join('\n');

class UsageError extends Error {}

function stringValue(value: string | boolean | string[] | undefined, name: string): string {
  if (typeof value !== 'string' || value === '') throw new UsageError(`missing --${name}`);
  return value;
}

function withStore<T>(fn: (store: Store, repoRoot: string) => T): T {
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    return fn(store, repoRoot);
  } finally {
    store.close();
  }
}

function handleSet(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { 'body-file': { type: 'string' } } });
  const [section] = parsed.positionals;
  if (section === undefined || parsed.positionals.length !== 1) throw new UsageError('set requires <section>');
  const bodyFile = stringValue(parsed.values['body-file'], 'body-file');
  const body = readFileSync(bodyFile, 'utf8');
  return withStore((store, repoRoot) => {
    setSection(store, section, body);
    regenerateExport(repoRoot, section, body);
    io.out(`constitution ${section} set`);
    return EXIT.OK;
  });
}

function handleAddPrinciple(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { rule: { type: 'string' }, rationale: { type: 'string' } } });
  if (parsed.positionals.length !== 0) throw new UsageError('add-principle takes no positional arguments');
  const rule = stringValue(parsed.values.rule, 'rule');
  const rationale = stringValue(parsed.values.rationale, 'rationale');
  return withStore((store, repoRoot) => {
    const principle = addPrinciple(store, rule, rationale);
    io.out(`added principle ${principle.id}`);
    const principlesBody = listPrinciples(store)
      .map((p) => `- **${p.rule}**: ${p.rationale}`)
      .join('\n');
    regenerateExport(repoRoot, 'principles', `# Principles\n\n${principlesBody}`);
    return EXIT.OK;
  });
}

function handleShow(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
  const [section] = parsed.positionals;
  if (section === undefined || parsed.positionals.length !== 1) throw new UsageError('show requires <section>');
  return withStore((store) => {
    const row = getSection(store, section);
    if (row === null) {
      io.err(`no constitution section: ${section}`);
      return EXIT.GATE_FAIL;
    }
    if (parsed.values.json === true) {
      io.out(JSON.stringify({ section, body: row.body }));
    } else {
      io.out(row.body);
    }
    return EXIT.OK;
  });
}

function handleList(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true });
  if (parsed.positionals.length !== 0) throw new UsageError('list takes no arguments');
  return withStore((store) => {
    const sections = listSections(store);
    if (sections.length === 0) {
      io.out('(no constitution sections)');
    } else {
      for (const s of sections) io.out(s);
    }
    return EXIT.OK;
  });
}

const SUBCOMMANDS = new Map<string, (args: string[], io: Io) => number>([
  ['set', handleSet],
  ['add-principle', handleAddPrinciple],
  ['show', handleShow],
  ['list', handleList],
]);

export const command: Command = {
  name: 'constitution',
  summary: 'Manage the instance constitution (vision, product definition, principles)',
  usage: USAGE,
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const handler = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (handler !== undefined) return Promise.resolve(handler(rest, io));
      throw new UsageError(
        sub === undefined ? 'missing constitution subcommand' : `unknown constitution subcommand: ${sub}`,
      );
    } catch (error) {
      if (error instanceof UsageError || error instanceof TypeError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.USAGE);
      }
      return Promise.resolve(EXIT.SYSTEM);
    }
  },
};
