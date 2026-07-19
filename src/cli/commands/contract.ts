import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ContextError } from '../../context/context.errors.js';
import { addArtifactContract, checkArtifactContracts, validateArtifact } from '../../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_STATUS } from '../../contracts/artifact.constants.js';
import {
  compileProtocolWorkPacket,
  persistProtocolWorkInspection,
  registerProtocolSupport,
} from '../../contracts/protocol-work.js';
import { evaluateAndPersistProtocolProposal } from '../../contracts/protocol-proposal.js';
import {
  activateApprovedProtocolProposal,
  ingestProtocolProposalReviewOutput,
} from '../../contracts/protocol-proposal-review.js';
import {
  applyApprovedReconciliation,
  evaluateAndPersistReconciliationProposal,
  evaluateAndPersistReconciliationReview,
} from '../../contracts/protocol-reconciliation.js';
import type { Store } from '../../db/store.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';

const USAGE = [
  'Usage:',
  '  sv-playbook contract add --ref <ref> --schema-file <path>',
  '  sv-playbook contract check',
  '  sv-playbook contract validate --ref <ref> --artifact-file <path>',
  '  sv-playbook contract support-add --schema-file <path> --metadata-schema-file <path> --metadata-file <path>',
  '  sv-playbook contract work-inspect',
  '  sv-playbook contract work-compile',
  '  sv-playbook contract proposal-check --proposal-file <path> --author-session-id <id>',
  '  sv-playbook contract proposal-review --review-file <path> --reviewer-session-id <id>',
  '  sv-playbook contract proposal-apply --proposal-id <id>',
  '  sv-playbook contract reconcile-check --proposal-file <path> --author-session-id <id>',
  '  sv-playbook contract reconcile-review --review-file <path> --reviewer-session-id <id>',
  '  sv-playbook contract reconcile-apply --proposal-id <id>',
].join('\n');

const SCHEMA_FILE_OPTION = 'schema-file';
const PROPOSAL_FILE_OPTION = 'proposal-file';
const AUTHOR_SESSION_OPTION = 'author-session-id';
const REVIEW_FILE_OPTION = 'review-file';
const REVIEWER_SESSION_OPTION = 'reviewer-session-id';
const PROPOSAL_ID_OPTION = 'proposal-id';

class UsageError extends Error {}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

function jsonObject(path: string, label: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UsageError(`${label} must be a JSON object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function withStore<T>(operation: (store: Store) => T): T {
  const store = openStore(commonRoot(getCwd()));
  try { return operation(store); } finally { store.close(); }
}

function add(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    ref: { type: 'string' }, [SCHEMA_FILE_OPTION]: { type: 'string' },
  } });
  const ref = required(parsed.values.ref, 'ref');
  const schema = jsonObject(required(parsed.values[SCHEMA_FILE_OPTION], SCHEMA_FILE_OPTION), 'schema');
  withStore((store) => { addArtifactContract(store, { ref, schema, status: ARTIFACT_CONTRACT_STATUS.ACTIVE }); });
  io.out(`artifact contract added: ${ref}`);
  return EXIT.OK;
}

function check(args: string[], io: Io): number {
  if (args.length !== 0) throw new UsageError('check takes no arguments');
  const result = withStore(checkArtifactContracts);
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function validate(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    ref: { type: 'string' }, 'artifact-file': { type: 'string' },
  } });
  const ref = required(parsed.values.ref, 'ref');
  const artifact: unknown = JSON.parse(readFileSync(required(parsed.values['artifact-file'], 'artifact-file'), 'utf8'));
  withStore((store) => { validateArtifact(store, ref, artifact); });
  io.out(`artifact valid: ${ref}`);
  return EXIT.OK;
}

function supportAdd(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    [SCHEMA_FILE_OPTION]: { type: 'string' },
    'metadata-schema-file': { type: 'string' },
    'metadata-file': { type: 'string' },
  } });
  const schema = jsonObject(required(parsed.values[SCHEMA_FILE_OPTION], SCHEMA_FILE_OPTION), 'schema');
  const metadataSchema = jsonObject(required(parsed.values['metadata-schema-file'], 'metadata-schema-file'), 'metadata schema');
  const metadata = jsonObject(required(parsed.values['metadata-file'], 'metadata-file'), 'metadata');
  withStore((store) => { registerProtocolSupport(store, { schema, metadataSchema, metadata }); });
  io.out('protocol support registered');
  return EXIT.OK;
}

function workInspect(args: string[], io: Io): number {
  if (args.length !== 0) throw new UsageError('work-inspect takes no arguments');
  const inspection = withStore(persistProtocolWorkInspection);
  io.out(JSON.stringify(inspection));
  return inspection.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function workCompile(args: string[], io: Io): number {
  if (args.length !== 0) throw new UsageError('work-compile takes no arguments');
  const packet = withStore(compileProtocolWorkPacket);
  io.out(JSON.stringify(packet));
  return EXIT.OK;
}

function proposalCheck(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    [PROPOSAL_FILE_OPTION]: { type: 'string' }, [AUTHOR_SESSION_OPTION]: { type: 'string' },
  } });
  const proposal: unknown = JSON.parse(readFileSync(required(parsed.values[PROPOSAL_FILE_OPTION], PROPOSAL_FILE_OPTION), 'utf8'));
  const sessionId = required(parsed.values[AUTHOR_SESSION_OPTION], AUTHOR_SESSION_OPTION);
  const result = withStore((store) => evaluateAndPersistProtocolProposal(store, proposal, sessionId));
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function proposalReview(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    [REVIEW_FILE_OPTION]: { type: 'string' }, [REVIEWER_SESSION_OPTION]: { type: 'string' },
  } });
  const raw = readFileSync(required(parsed.values[REVIEW_FILE_OPTION], REVIEW_FILE_OPTION), 'utf8');
  const sessionId = required(parsed.values[REVIEWER_SESSION_OPTION], REVIEWER_SESSION_OPTION);
  const result = withStore((store) => ingestProtocolProposalReviewOutput(store, raw, sessionId));
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function proposalApply(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: { [PROPOSAL_ID_OPTION]: { type: 'string' } } });
  const proposalId = required(parsed.values[PROPOSAL_ID_OPTION], PROPOSAL_ID_OPTION);
  withStore((store) => { activateApprovedProtocolProposal(store, proposalId); });
  io.out(`protocol proposal applied: ${proposalId}`);
  return EXIT.OK;
}

function reconcileCheck(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    [PROPOSAL_FILE_OPTION]: { type: 'string' }, [AUTHOR_SESSION_OPTION]: { type: 'string' },
  } });
  const value: unknown = JSON.parse(readFileSync(required(parsed.values[PROPOSAL_FILE_OPTION], PROPOSAL_FILE_OPTION), 'utf8'));
  const sessionId = required(parsed.values[AUTHOR_SESSION_OPTION], AUTHOR_SESSION_OPTION);
  const result = withStore((store) => evaluateAndPersistReconciliationProposal(store, value, sessionId));
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function reconcileReview(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    [REVIEW_FILE_OPTION]: { type: 'string' }, [REVIEWER_SESSION_OPTION]: { type: 'string' },
  } });
  const value: unknown = JSON.parse(readFileSync(required(parsed.values[REVIEW_FILE_OPTION], REVIEW_FILE_OPTION), 'utf8'));
  const sessionId = required(parsed.values[REVIEWER_SESSION_OPTION], REVIEWER_SESSION_OPTION);
  const result = withStore((store) => evaluateAndPersistReconciliationReview(store, value, sessionId));
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function reconcileApply(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: { [PROPOSAL_ID_OPTION]: { type: 'string' } } });
  const proposalId = required(parsed.values[PROPOSAL_ID_OPTION], PROPOSAL_ID_OPTION);
  withStore((store) => { applyApprovedReconciliation(store, proposalId); });
  io.out(`reconciliation applied: ${proposalId}`);
  return EXIT.OK;
}

const SUBCOMMANDS: Readonly<Record<string, (args: string[], io: Io) => number>> = {
  add,
  check,
  validate,
  'support-add': supportAdd,
  'work-inspect': workInspect,
  'work-compile': workCompile,
  'proposal-check': proposalCheck,
  'proposal-review': proposalReview,
  'proposal-apply': proposalApply,
  'reconcile-check': reconcileCheck,
  'reconcile-review': reconcileReview,
  'reconcile-apply': reconcileApply,
};

export const command: Command = {
  name: 'contract',
  summary: 'Manage authoritative JSON Schema contracts for typed role handoffs',
  usage: USAGE,
  run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      const handler = subcommand === undefined ? undefined : SUBCOMMANDS[subcommand];
      if (handler === undefined) throw new UsageError('missing or unknown contract subcommand');
      return Promise.resolve(handler(rest, io));
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
