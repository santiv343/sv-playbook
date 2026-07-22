import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compileContext } from '../../context/compiler.js';
import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../../context/context.constants.js';
import { ContextError } from '../../context/context.errors.js';
import type { CapabilityEffect, ContextCompileInput, ContextItemInput, ContextItemStrength } from '../../context/context.types.js';
import { readMarkdownSection } from '../../context/importers/markdown.js';
import { persistContextPack } from '../../context/packs.js';
import { addContextItem, loadContextCatalog, replaceContextPrecedence } from '../../context/repository.js';
import { commonRoot, openStore } from '../../db/store.js';
import type { Store } from '../../db/store.types.js';
import { getCwd } from '../../runtime/context.js';
import { CLI_ASSIGNMENT_SEPARATOR, EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { STRING_OPTION } from './options.constants.js';

const USAGE = [
  'Usage:',
  '  sv-playbook context add --id <id> --version <n> --kind <kind> --semantic-key <key> --body-file <path> --provenance <text> [--strength <mandatory|advisory|reference>] [options]',
  '  sv-playbook context precedence <kind> [kind...]',
  '  sv-playbook context compile --role <role> --phase <phase> [options]',
  '  sv-playbook context list',
  '',
  'Repeatable add options: --tag <tag> --selector <dimension=value> --dependency <id@version> --supersedes <id@version> --capability <name=allow|deny>',
  'Repeatable compile options: --tag <tag> --attribute <dimension=value> --reference <id@version> --capability <effective-capability>',
].join('\n');

class UsageError extends Error {}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

// `--selector dimension=value` (y --capability, --dependency, etc.) usan
// esta misma sintaxis clave=valor repetible — pairs() es el parser
// compartido, capabilityPairs() lo especializa exigiendo exactamente UN
// efecto por capability (duplicar `--capability x=allow --capability
// x=deny` es un error de uso, no "el último gana").
function pairs(values: readonly string[] | undefined, name: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const value of values ?? []) {
    const separator = value.indexOf(CLI_ASSIGNMENT_SEPARATOR);
    if (separator < 1 || separator === value.length - 1) throw new UsageError(`invalid --${name}: ${value}`);
    const key = value.slice(0, separator);
    const entry = value.slice(separator + 1);
    (result[key] ??= []).push(entry);
  }
  return result;
}

function capabilityPairs(values: readonly string[] | undefined): Record<string, CapabilityEffect> {
  const raw = pairs(values, 'capability');
  const result: Record<string, CapabilityEffect> = {};
  for (const [capability, effects] of Object.entries(raw)) {
    if (effects.length !== 1) throw new UsageError(`duplicate --capability: ${capability}`);
    const effect = effects[0];
    if (effect !== CAPABILITY_EFFECT.ALLOW && effect !== CAPABILITY_EFFECT.DENY) {
      throw new UsageError(`invalid capability effect for ${capability}`);
    }
    result[capability] = effect;
  }
  return result;
}

function parseStrength(value: string): ContextItemStrength {
  for (const strength of Object.values(CONTEXT_ITEM_STRENGTH)) {
    if (value === strength) return strength;
  }
  throw new UsageError(`invalid --strength: ${value}`);
}

function withStore<T>(operation: (store: Store) => T): T {
  const store = openStore(commonRoot(getCwd()));
  try {
    return operation(store);
  } finally {
    store.close();
  }
}

function add(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: 'string' }, version: { type: 'string' }, kind: { type: 'string' },
    'semantic-key': { type: 'string' }, 'body-file': { type: 'string' }, heading: { type: 'string' }, provenance: { type: 'string' },
    strength: STRING_OPTION,
    tag: { type: 'string', multiple: true }, selector: { type: 'string', multiple: true },
    dependency: { type: 'string', multiple: true }, supersedes: { type: 'string', multiple: true },
    capability: { type: 'string', multiple: true },
  } });
  const version = Number(required(parsed.values.version, 'version'));
  const bodyFile = required(parsed.values['body-file'], 'body-file');
  const body = parsed.values.heading === undefined
    ? readFileSync(bodyFile, 'utf8')
    : readMarkdownSection(bodyFile, parsed.values.heading);
  const strengthValue = parsed.values.strength ?? CONTEXT_ITEM_STRENGTH.MANDATORY;
  const strength = parseStrength(strengthValue);
  const input: ContextItemInput = {
    id: required(parsed.values.id, 'id'), version, kind: required(parsed.values.kind, 'kind'),
    status: CONTEXT_ITEM_STATUS.ACTIVE, strength,
    semanticKey: required(parsed.values['semantic-key'], 'semantic-key'),
    body,
    provenance: required(parsed.values.provenance, 'provenance'),
    tags: parsed.values.tag ?? [], selectors: pairs(parsed.values.selector, 'selector'),
    dependencies: parsed.values.dependency ?? [], supersedes: parsed.values.supersedes ?? [],
    capabilities: capabilityPairs(parsed.values.capability),
  };
  withStore((store) => { addContextItem(store, input); });
  io.out(`added context ${input.id}@${input.version}`);
  return EXIT.OK;
}

function precedence(args: string[], io: Io): number {
  if (args.length === 0) throw new UsageError('precedence requires at least one kind');
  withStore((store) => { replaceContextPrecedence(store, args); });
  io.out(`context precedence set: ${args.join(' > ')}`);
  return EXIT.OK;
}

function compile(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    role: { type: 'string' }, phase: { type: 'string' }, tag: { type: 'string', multiple: true },
    attribute: { type: 'string', multiple: true }, reference: { type: 'string', multiple: true },
    capability: { type: 'string', multiple: true },
  } });
  const input: ContextCompileInput = {
    role: required(parsed.values.role, 'role'), phase: required(parsed.values.phase, 'phase'),
    tags: parsed.values.tag ?? [], attributes: pairs(parsed.values.attribute, 'attribute'),
    references: parsed.values.reference ?? [], requestedCapabilities: parsed.values.capability ?? [],
  };
  const pack = withStore((store) => {
    const result = compileContext(loadContextCatalog(store), input);
    persistContextPack(store, input, result);
    return result;
  });
  io.out(JSON.stringify(pack));
  return pack.capabilities.every((capability) => capability.effect === CAPABILITY_EFFECT.ALLOW) ? EXIT.OK : EXIT.GATE_FAIL;
}

function list(args: string[], io: Io): number {
  if (args.length > 0) throw new UsageError('list takes no arguments');
  const catalog = withStore(loadContextCatalog);
  io.out(JSON.stringify(catalog));
  return EXIT.OK;
}

const SUBCOMMANDS: Readonly<Record<string, (args: string[], io: Io) => number>> = { add, compile, list, precedence };

export const command: Command = {
  name: 'context',
  summary: 'Manage and compile durable role-scoped context',
  usage: USAGE,
  run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      const handler = subcommand === undefined ? undefined : SUBCOMMANDS[subcommand];
      if (handler === undefined) throw new UsageError('missing or unknown context subcommand');
      return Promise.resolve(handler(rest, io));
    } catch (error) {
      if (error instanceof UsageError || error instanceof ContextError || error instanceof TypeError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
      throw error;
    }
  },
};
