import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ContextError } from '../../context/context.errors.js';
import { addExecutionProfile, cloneExecutionProfile, listExecutionProfiles, setExecutionProfile } from '../../gateway/profiles.js';
import type { ExecutionProfileInput } from '../../gateway/gateway.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { CLI_ASSIGNMENT_SEPARATOR, EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';

const USAGE = [
  'Usage: sv-playbook execution-profile <subcommand>',
  '  sv-playbook execution-profile add --id <id> --role <role> --adapter <id> --agent <id> --provider <id> --model <id> --adapter-config-file <path> --poll-ms <n> --timeout-ms <n> --grace-ms <n> [--max-duration-ms <n>] --tool <id=allow|deny>...',
  '  sv-playbook execution-profile set --id <id> --role <role> --adapter <id> --agent <id> --provider <id> --model <id> --adapter-config-file <path> --poll-ms <n> --timeout-ms <n> --grace-ms <n> [--max-duration-ms <n>] --tool <id=allow|deny>...',
  '  sv-playbook execution-profile clone --from <id> --id <id> --role <role> --agent <id> [--provider <id>] [--model <id>] [--variant <id>] [--tool <id=allow|deny>]...',
  '  sv-playbook execution-profile list',
].join('\n');

class UsageError extends Error {}
const TOOL_POLICY_EFFECT = { ALLOW: 'allow', DENY: 'deny' } as const;
const STRING_OPTION_TYPE = 'string';
const MAX_DURATION_MS_FLAG = 'max-duration-ms';
const EXECUTION_PROFILE_SUBCOMMAND = { ADD: 'add', CLONE: 'clone', LIST: 'list', SET: 'set' } as const;

function listProfiles(args: string[], io: Io): number {
  if (args.length > 0) throw new UsageError('list takes no arguments');
  const store = openStore(commonRoot(getCwd()));
  try {
    io.out(JSON.stringify(listExecutionProfiles(store)));
  } finally {
    store.close();
  }
  return EXIT.OK;
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

function positiveInteger(value: string | undefined, name: string): number {
  const number = Number(required(value, name));
  if (!Number.isInteger(number) || number < 1) throw new UsageError(`--${name} must be a positive integer`);
  return number;
}

function adapterConfig(path: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UsageError('adapter config must be a JSON object');
  }
  return Object.fromEntries(Object.entries(value));
}

function toolPolicy(values: readonly string[] | undefined): Record<string, boolean> {
  const tools: Record<string, boolean> = {};
  for (const value of values ?? []) {
    const separator = value.lastIndexOf(CLI_ASSIGNMENT_SEPARATOR);
    const tool = value.slice(0, separator);
    const effect = value.slice(separator + 1);
    if (separator < 1 || (effect !== TOOL_POLICY_EFFECT.ALLOW && effect !== TOOL_POLICY_EFFECT.DENY)) throw new UsageError(`invalid --tool: ${value}`);
    if (tools[tool] !== undefined) throw new UsageError(`duplicate --tool: ${tool}`);
    tools[tool] = effect === TOOL_POLICY_EFFECT.ALLOW;
  }
  return tools;
}

function writeProfile(args: string[], io: Io, operation: typeof EXECUTION_PROFILE_SUBCOMMAND[keyof typeof EXECUTION_PROFILE_SUBCOMMAND]): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: STRING_OPTION_TYPE }, role: { type: STRING_OPTION_TYPE }, adapter: { type: STRING_OPTION_TYPE }, agent: { type: STRING_OPTION_TYPE },
    provider: { type: STRING_OPTION_TYPE }, model: { type: STRING_OPTION_TYPE }, variant: { type: STRING_OPTION_TYPE },
    'adapter-config-file': { type: STRING_OPTION_TYPE }, 'poll-ms': { type: STRING_OPTION_TYPE },
    'timeout-ms': { type: STRING_OPTION_TYPE }, 'grace-ms': { type: STRING_OPTION_TYPE },
    [MAX_DURATION_MS_FLAG]: { type: STRING_OPTION_TYPE },
    tool: { type: STRING_OPTION_TYPE, multiple: true },
  } });
  const profile: ExecutionProfileInput = {
    id: required(parsed.values.id, 'id'),
    roleId: required(parsed.values.role, 'role'),
    adapterId: required(parsed.values.adapter, 'adapter'),
    agentId: required(parsed.values.agent, 'agent'),
    providerId: required(parsed.values.provider, 'provider'),
    modelId: required(parsed.values.model, 'model'),
    adapterConfig: adapterConfig(required(parsed.values['adapter-config-file'], 'adapter-config-file')),
    observationIntervalMs: positiveInteger(parsed.values['poll-ms'], 'poll-ms'),
    noProgressTimeoutMs: positiveInteger(parsed.values['timeout-ms'], 'timeout-ms'),
    cancellationGraceMs: positiveInteger(parsed.values['grace-ms'], 'grace-ms'),
    tools: toolPolicy(parsed.values.tool),
    enabled: true,
  };
  if (parsed.values.variant !== undefined) profile.variant = parsed.values.variant;
  const maxDurationMs = parsed.values[MAX_DURATION_MS_FLAG];
  if (maxDurationMs !== undefined) profile.maxRunDurationMs = positiveInteger(maxDurationMs, MAX_DURATION_MS_FLAG);
  const store = openStore(commonRoot(getCwd()));
  try {
    if (operation === EXECUTION_PROFILE_SUBCOMMAND.ADD) addExecutionProfile(store, profile);
    else setExecutionProfile(store, profile);
  } finally {
    store.close();
  }
  io.out(`execution profile ${operation === EXECUTION_PROFILE_SUBCOMMAND.ADD ? 'added' : 'updated'}: ${profile.id}`);
  return EXIT.OK;
}

function cloneProfile(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    from: { type: STRING_OPTION_TYPE }, id: { type: STRING_OPTION_TYPE }, role: { type: STRING_OPTION_TYPE }, agent: { type: STRING_OPTION_TYPE },
    provider: { type: STRING_OPTION_TYPE }, model: { type: STRING_OPTION_TYPE }, variant: { type: STRING_OPTION_TYPE },
    tool: { type: STRING_OPTION_TYPE, multiple: true },
  } });
  const store = openStore(commonRoot(getCwd()));
  try {
    const profile = cloneExecutionProfile(store, {
      sourceProfileId: required(parsed.values.from, 'from'),
      id: required(parsed.values.id, 'id'),
      roleId: required(parsed.values.role, 'role'),
      agentId: required(parsed.values.agent, 'agent'),
      ...(parsed.values.provider === undefined ? {} : { providerId: parsed.values.provider }),
      ...(parsed.values.model === undefined ? {} : { modelId: parsed.values.model }),
      ...(parsed.values.variant === undefined ? {} : { variant: parsed.values.variant }),
      tools: toolPolicy(parsed.values.tool),
    });
    io.out(`execution profile cloned: ${profile.id}`);
  } finally {
    store.close();
  }
  return EXIT.OK;
}

export const command: Command = {
  name: 'execution-profile',
  summary: 'Manage provider-neutral execution profiles and adapter-specific projections',
  usage: USAGE,
  run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      if (subcommand === EXECUTION_PROFILE_SUBCOMMAND.LIST) return Promise.resolve(listProfiles(rest, io));
      if (subcommand === EXECUTION_PROFILE_SUBCOMMAND.CLONE) return Promise.resolve(cloneProfile(rest, io));
      if (subcommand !== EXECUTION_PROFILE_SUBCOMMAND.ADD && subcommand !== EXECUTION_PROFILE_SUBCOMMAND.SET) {
        throw new UsageError('missing or unknown execution-profile subcommand');
      }
      return Promise.resolve(writeProfile(rest, io, subcommand));
    } catch (error) {
      if (error instanceof UsageError || error instanceof ContextError || error instanceof TypeError || error instanceof SyntaxError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
      throw error;
    }
  },
};
