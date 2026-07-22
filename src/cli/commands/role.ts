import { parseArgs } from 'node:util';
import { ContextError } from '../../context/context.errors.js';
import { canonicalJson } from '../../context/digest.js';
import { commonRoot, openStore } from '../../db/store.js';
import type { Store } from '../../db/store.types.js';
import { checkCatalogClosure } from '../../check/catalog-closure.js';
import {
  compileRoleProjections,
  inspectRoleProjections,
  promoteRoleProjections,
} from '../../gateway/adapters/role-projection-registry.js';
import { listExecutionProfiles } from '../../gateway/profiles.js';
import { getCwd } from '../../runtime/context.js';
import {
  addModelCapability,
  addResponsibility,
  addRoleEscalation,
  addRoleHandoff,
  checkRoleCatalog,
  listRoleCatalog,
  requireRole,
  setRoleContract,
  setRoleCatalogProfile,
  setRolePolicy,
} from '../../roles/catalog.js';
import { RESPONSIBILITY_CLASSIFICATION, SELF_CORRECTION_MODE } from '../../roles/role.constants.js';
import type { ResponsibilityClassification } from '../../roles/catalog.types.js';
import { checkRoleSystem } from '../../roles/system-check.js';
import { activateRoleCatalog, requireActiveRoleCatalog } from '../../roles/catalog-activation.js';
import { addModelCapabilityEvidence } from '../../roles/model-capability-evidence.js';
import { bootstrapBundledRoleCatalog } from '../../roles/bundled-profile-bootstrap.js';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { ROLE_SUBCOMMAND } from './role.constants.js';
import { EMPTY_SIZE } from '../../platform.constants.js';
import { ROLE_CATALOG_PROFILE_SOURCE } from '../../roles/catalog.constants.js';
import { evaluateModels } from '../role-model-evaluation.js';
import {
  compileRoleCharterProjection,
  inspectRoleCharterProjection,
} from '../../roles/charter-projection.js';

const USAGE = [
  'Usage:',
  '  sv-playbook role responsibility --id <id> --class <semantic|deterministic> --description <text>',
  '  sv-playbook role model-capability --id <id> --description <text>',
  '  sv-playbook role model-evidence --provider <id> --model <id> [--variant <id>] --capability <id> --evidence-ref <ref> --evidence-digest <sha256:digest> --assessed-at <ISO timestamp> --expires-at <ISO timestamp>',
  '  sv-playbook role define --id <role> --mission <text> --context <id@version> --input <contract> --output <contract> --model-capability <id> --judgment <id>... [--capability-request <class>...]',
  '  sv-playbook role require --id <role>',
  '  sv-playbook role policy --role <role> --prohibit <operation>... --self-correction <none|bounded> [--self-correct <output-class>...] --stop <condition>... --escalation <class>...',
  '  sv-playbook role profile --id <profile> --entry-role <role>',
  '  sv-playbook role handoff --from <role> --to <role> --artifact <contract>',
  '  sv-playbook role escalation --role <role> --class <id>',
  '  sv-playbook role check',
  '  sv-playbook role list',
  '  sv-playbook role project',
  '  sv-playbook role activate',
  '  sv-playbook role bootstrap',
  '  sv-playbook role evaluate-models',
  '  sv-playbook role receipt',
].join('\n');

class UsageError extends Error {}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new UsageError(`missing --${name}`);
  return value;
}

// `role` es el comando más grande del CLI (18 subcomandos en USAGE) porque
// es la única puerta de escritura al catálogo de roles — PRINCIPLE-012 (el
// CLI es la única interfaz) aplicado: nada escribe roles/responsibilities/
// policies directo a la DB, todo pasa por acá, que a su vez delega en
// roles/catalog.ts. withStore() es el wrapper común: abre, ejecuta, cierra
// siempre (incluso si `operation` lanza) — el patrón que evita conexiones
// SQLite colgadas entre invocaciones de CLI de vida corta.
function withStore<T>(operation: (store: Store) => T): T {
  const store = openStore(commonRoot(getCwd()));
  try {
    return operation(store);
  } finally {
    store.close();
  }
}

function requireNoArguments(args: readonly string[], operation: string): void {
  if (args.length !== EMPTY_SIZE) throw new UsageError(`${operation} takes no arguments`);
}

function responsibility(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: 'string' }, class: { type: 'string' }, description: { type: 'string' },
  } });
  const classification = required(parsed.values.class, 'class');
  if (classification !== RESPONSIBILITY_CLASSIFICATION.SEMANTIC && classification !== RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC) {
    throw new UsageError(`invalid responsibility class: ${classification}`);
  }
  withStore((store) => {
    addResponsibility(store, {
      id: required(parsed.values.id, 'id'),
      classification: classification satisfies ResponsibilityClassification,
      description: required(parsed.values.description, 'description'),
    });
  });
  io.out(`responsibility added: ${required(parsed.values.id, 'id')}`);
  return EXIT.OK;
}

function activate(args: string[], io: Io): number {
  requireNoArguments(args, ROLE_SUBCOMMAND.ACTIVATE);
  io.out(canonicalJson(withStore(activateRoleCatalog)));
  return EXIT.OK;
}

function bootstrap(args: string[], io: Io): number {
  requireNoArguments(args, ROLE_SUBCOMMAND.BOOTSTRAP);
  io.out(canonicalJson(withStore(bootstrapBundledRoleCatalog)));
  return EXIT.OK;
}

function receipt(args: string[], io: Io): number {
  requireNoArguments(args, ROLE_SUBCOMMAND.RECEIPT);
  io.out(canonicalJson(withStore(requireActiveRoleCatalog)));
  return EXIT.OK;
}

function modelCapability(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: 'string' }, description: { type: 'string' },
  } });
  withStore((store) => {
    addModelCapability(store, {
      id: required(parsed.values.id, 'id'),
      description: required(parsed.values.description, 'description'),
    });
  });
  io.out('model capability added');
  return EXIT.OK;
}

function modelEvidence(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    provider: { type: 'string' }, model: { type: 'string' }, variant: { type: 'string' },
    capability: { type: 'string' }, 'evidence-ref': { type: 'string' },
    'evidence-digest': { type: 'string' }, 'assessed-at': { type: 'string' }, 'expires-at': { type: 'string' },
  } });
  const input = {
    providerId: required(parsed.values.provider, 'provider'),
    modelId: required(parsed.values.model, 'model'),
    capabilityId: required(parsed.values.capability, 'capability'),
    evidenceRef: required(parsed.values['evidence-ref'], 'evidence-ref'),
    evidenceDigest: required(parsed.values['evidence-digest'], 'evidence-digest'),
    assessedAt: required(parsed.values['assessed-at'], 'assessed-at'),
    expiresAt: required(parsed.values['expires-at'], 'expires-at'),
    ...(parsed.values.variant === undefined ? {} : { variant: parsed.values.variant }),
  };
  io.out(canonicalJson(withStore((store) => addModelCapabilityEvidence(store, input))));
  return EXIT.OK;
}

function define(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: 'string' }, mission: { type: 'string' }, context: { type: 'string' },
    input: { type: 'string' }, output: { type: 'string' }, 'model-capability': { type: 'string' },
    judgment: { type: 'string', multiple: true }, 'capability-request': { type: 'string', multiple: true },
  } });
  const roleId = required(parsed.values.id, 'id');
  withStore((store) => {
    setRoleContract(store, {
      roleId,
      mission: required(parsed.values.mission, 'mission'),
      contextItemRef: required(parsed.values.context, 'context'),
      inputContractRef: required(parsed.values.input, 'input'),
      outputContractRef: required(parsed.values.output, 'output'),
      minimumModelCapability: required(parsed.values['model-capability'], 'model-capability'),
      exclusiveJudgments: parsed.values.judgment ?? [],
      capabilityRequestClasses: parsed.values['capability-request'] ?? [],
    });
  });
  io.out(`role defined: ${roleId}`);
  return EXIT.OK;
}

function handoff(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    from: { type: 'string' }, to: { type: 'string' }, artifact: { type: 'string' },
  } });
  withStore((store) => {
    addRoleHandoff(store, {
      sourceRoleId: required(parsed.values.from, 'from'),
      targetRoleId: required(parsed.values.to, 'to'),
      artifactContractRef: required(parsed.values.artifact, 'artifact'),
    });
  });
  io.out('role handoff added');
  return EXIT.OK;
}

function escalation(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    role: { type: 'string' }, class: { type: 'string' },
  } });
  withStore((store) => {
    addRoleEscalation(store, {
      roleId: required(parsed.values.role, 'role'),
      classId: required(parsed.values.class, 'class'),
    });
  });
  io.out('role escalation added');
  return EXIT.OK;
}

function requireCatalogRole(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: { id: { type: 'string' } } });
  const roleId = required(parsed.values.id, 'id');
  withStore((store) => { requireRole(store, roleId); });
  io.out(`required role added: ${roleId}`);
  return EXIT.OK;
}

function policy(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    role: { type: 'string' }, prohibit: { type: 'string', multiple: true },
    'self-correction': { type: 'string' }, 'self-correct': { type: 'string', multiple: true },
    stop: { type: 'string', multiple: true }, escalation: { type: 'string', multiple: true },
  } });
  const selfCorrectionMode = required(parsed.values['self-correction'], 'self-correction');
  if (selfCorrectionMode !== SELF_CORRECTION_MODE.NONE && selfCorrectionMode !== SELF_CORRECTION_MODE.BOUNDED) {
    throw new UsageError(`invalid self correction mode: ${selfCorrectionMode}`);
  }
  withStore((store) => {
    setRolePolicy(store, {
      roleId: required(parsed.values.role, 'role'),
      prohibitions: parsed.values.prohibit ?? [],
      selfCorrectionMode,
      selfCorrectionScopes: parsed.values['self-correct'] ?? [],
      stopConditions: parsed.values.stop ?? [],
      escalationClasses: parsed.values.escalation ?? [],
    });
  });
  io.out('role policy added');
  return EXIT.OK;
}

function profile(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: false, options: {
    id: { type: 'string' }, 'entry-role': { type: 'string' },
  } });
  withStore((store) => {
    setRoleCatalogProfile(store, {
      profileId: required(parsed.values.id, 'id'),
      entryRoleId: required(parsed.values['entry-role'], 'entry-role'),
      sourceKind: ROLE_CATALOG_PROFILE_SOURCE.CUSTOM,
    });
  });
  io.out('role catalog profile configured');
  return EXIT.OK;
}

async function check(args: string[], io: Io): Promise<number> {
  requireNoArguments(args, ROLE_SUBCOMMAND.CHECK);
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  let result;
  try {
    result = await checkRoleSystem(store, repoRoot);
  } finally {
    store.close();
  }
  io.out(JSON.stringify(result));
  return result.valid ? EXIT.OK : EXIT.GATE_FAIL;
}

function project(args: string[], io: Io): number {
  requireNoArguments(args, ROLE_SUBCOMMAND.PROJECT);
  const repoRoot = commonRoot(getCwd());
  const result = withStore((store) => {
    const catalog = checkRoleCatalog(store);
    const profiles = listExecutionProfiles(store);
    const harnessCandidates = compileRoleProjections(repoRoot, profiles);
    const closure = checkCatalogClosure(store, harnessCandidates);
    const violations = [...new Set([...catalog.violations, ...closure.violations])].sort();
    if (violations.length > EMPTY_SIZE) return { valid: false, violations, candidates: [], receipts: [] };
    const candidates = [...harnessCandidates, compileRoleCharterProjection(store, repoRoot)];
    const receipts = promoteRoleProjections(store, candidates);
    const persisted = checkCatalogClosure(store, inspectRoleProjections(store, repoRoot, profiles));
    const charters = inspectRoleCharterProjection(store, repoRoot);
    return {
      valid: persisted.valid && charters.valid,
      violations: [...persisted.violations, ...charters.violations].sort(),
      candidates,
      receipts,
    };
  });
  if (!result.valid) {
    io.out(JSON.stringify({ valid: false, violations: result.violations }));
    return EXIT.GATE_FAIL;
  }
  io.out(JSON.stringify({
    valid: true,
    projections: result.candidates.map((candidate) => ({
      adapterId: candidate.adapterId,
      agentIds: candidate.agentIds,
      artifacts: candidate.artifacts.map((artifact) => artifact.targetPath),
    })),
    receipts: result.receipts,
  }));
  return EXIT.OK;
}

function list(args: string[], io: Io): number {
  requireNoArguments(args, ROLE_SUBCOMMAND.LIST);
  io.out(JSON.stringify(withStore(listRoleCatalog)));
  return EXIT.OK;
}

type RoleCommandHandler = (args: string[], io: Io) => number | Promise<number>;

const SUBCOMMANDS: Readonly<Record<string, RoleCommandHandler>> = {
  [ROLE_SUBCOMMAND.ACTIVATE]: activate,
  [ROLE_SUBCOMMAND.BOOTSTRAP]: bootstrap,
  [ROLE_SUBCOMMAND.CHECK]: check,
  [ROLE_SUBCOMMAND.DEFINE]: define,
  [ROLE_SUBCOMMAND.EVALUATE_MODELS]: evaluateModels,
  [ROLE_SUBCOMMAND.ESCALATION]: escalation,
  [ROLE_SUBCOMMAND.HANDOFF]: handoff,
  [ROLE_SUBCOMMAND.LIST]: list,
  [ROLE_SUBCOMMAND.MODEL_CAPABILITY]: modelCapability,
  [ROLE_SUBCOMMAND.MODEL_EVIDENCE]: modelEvidence,
  [ROLE_SUBCOMMAND.POLICY]: policy,
  [ROLE_SUBCOMMAND.PROFILE]: profile,
  [ROLE_SUBCOMMAND.PROJECT]: project,
  [ROLE_SUBCOMMAND.RECEIPT]: receipt,
  [ROLE_SUBCOMMAND.REQUIRE]: requireCatalogRole,
  [ROLE_SUBCOMMAND.RESPONSIBILITY]: responsibility,
};

export const command: Command = {
  name: 'role',
  summary: 'Manage structured role authority, contracts, handoffs, and escalations',
  usage: USAGE,
  async run(args, io): Promise<number> {
    try {
      const [subcommand, ...rest] = args;
      const handler = subcommand === undefined ? undefined : SUBCOMMANDS[subcommand];
      if (handler === undefined) throw new UsageError('missing or unknown role subcommand');
      return await handler(rest, io);
    } catch (error) {
      if (error instanceof UsageError || error instanceof ContextError || error instanceof TypeError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return EXIT.GATE_FAIL;
      }
      throw error;
    }
  },
};
