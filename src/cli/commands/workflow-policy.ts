import { parseArgs } from 'node:util';
import { commonRoot, openStore } from '../../db/store.js';
import { setWorkflowFailurePolicy } from '../../orchestration/runtime-configuration.js';
import { getCwd } from '../../runtime/context.js';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';

const USAGE = 'Usage: sv-playbook workflow-policy set --error <code> --retryable <true|false>';
const SUBCOMMAND = { SET: 'set' } as const;
const BOOLEAN_TEXT = { TRUE: 'true', FALSE: 'false' } as const;

class UsageError extends Error {}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

function booleanValue(value: string | undefined): boolean {
  const text = required(value, 'retryable');
  if (text === BOOLEAN_TEXT.TRUE) return true;
  if (text === BOOLEAN_TEXT.FALSE) return false;
  throw new UsageError('--retryable must be true or false');
}

function setPolicy(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    error: { type: 'string' }, retryable: { type: 'string' },
  } });
  const errorCode = required(parsed.values.error, 'error');
  const retryable = booleanValue(parsed.values.retryable);
  const store = openStore(commonRoot(getCwd()));
  try {
    setWorkflowFailurePolicy(store, errorCode, retryable);
  } finally {
    store.close();
  }
  io.out(`workflow failure policy updated: ${errorCode} retryable=${String(retryable)}`);
  return EXIT.OK;
}

export const command: Command = {
  name: 'workflow-policy',
  summary: 'Configure deterministic workflow failure retry classification',
  usage: USAGE,
  run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      if (subcommand !== SUBCOMMAND.SET) throw new UsageError('missing or unknown workflow-policy subcommand');
      return Promise.resolve(setPolicy(rest, io));
    } catch (error) {
      if (error instanceof UsageError || error instanceof RangeError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
      throw error;
    }
  },
};
