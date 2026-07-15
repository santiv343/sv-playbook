import { parseArgs } from 'node:util';
import { ContextError } from '../../context/context.errors.js';
import { commonRoot, openStore } from '../../db/store.js';
import type { Store } from '../../db/store.types.js';
import { createDefaultAgentAdapterRegistry } from '../../gateway/adapter-registry.js';
import { dispatchRun } from '../../gateway/gateway.js';
import type { WorkRunSpecRequest } from '../../gateway/gateway.types.js';
import { prepareRunSpec } from '../../gateway/run-spec.js';
import { getCwd } from '../../runtime/context.js';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { parseWorkDefinitionReference } from '../../tasks/work-definitions.js';
import { WorkDefinitionError } from '../../tasks/work-definition.errors.js';

const USAGE = [
  'Usage:',
  '  sv-playbook dispatch prepare --role <role> --phase <phase> --task <id@version> [--profile <id>]',
  '  sv-playbook dispatch start --run <run-id>',
].join('\n');

class UsageError extends Error {}
const DISPATCH_SUBCOMMAND = { PREPARE: 'prepare', START: 'start' } as const;

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

function withStore<T>(operation: (store: Store, root: string) => T): T {
  const root = commonRoot(getCwd());
  const store = openStore(root);
  try {
    return operation(store, root);
  } finally {
    store.close();
  }
}

async function withStoreAsync<T>(operation: (store: Store, root: string) => Promise<T>): Promise<T> {
  const root = commonRoot(getCwd());
  const store = openStore(root);
  try {
    return await operation(store, root);
  } finally {
    store.close();
  }
}

function prepare(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    role: { type: 'string' }, phase: { type: 'string' }, task: { type: 'string' }, profile: { type: 'string' },
  } });
  const request: WorkRunSpecRequest = {
    roleId: required(parsed.values.role, 'role'),
    phase: required(parsed.values.phase, 'phase'),
    workDefinitionRef: parseWorkDefinitionReference(required(parsed.values.task, 'task')),
  };
  if (parsed.values.profile !== undefined) request.executionProfileId = parsed.values.profile;
  const result = withStore((store) => prepareRunSpec(store, request));
  io.out(JSON.stringify(result));
  return EXIT.OK;
}

async function start(args: string[], io: Io): Promise<number> {
  const parsed = parseArgs({ args, allowPositionals: false, options: { run: { type: 'string' } } });
  const runId = required(parsed.values.run, 'run');
  const receipt = await withStoreAsync(async (store, root) => {
    const adapters = createDefaultAgentAdapterRegistry();
    return dispatchRun(store, runId, adapters, root);
  });
  io.out(JSON.stringify(receipt));
  return EXIT.OK;
}

export const command: Command = {
  name: 'dispatch',
  summary: 'Prepare immutable RunSpecs and dispatch only through registered adapters',
  async run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      if (subcommand === DISPATCH_SUBCOMMAND.PREPARE) return prepare(rest, io);
      if (subcommand === DISPATCH_SUBCOMMAND.START) return await start(rest, io);
      throw new UsageError('missing or unknown dispatch subcommand');
    } catch (error) {
      if (error instanceof UsageError || error instanceof ContextError || error instanceof WorkDefinitionError || error instanceof TypeError) {
        io.err(USAGE);
        const code = error instanceof ContextError || error instanceof WorkDefinitionError ? `${error.code} ` : '';
        io.err(`error: ${code}${error.message}`);
        return EXIT.GATE_FAIL;
      }
      throw error;
    }
  },
};
