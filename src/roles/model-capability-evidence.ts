import { v7 as uuidv7 } from 'uuid';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { executionProfiles } from '../gateway/schema.constants.js';
import type { ExecutionProfile } from '../gateway/gateway.types.js';
import { roleContracts } from '../orchestration/schema.constants.js';
import { ROLE_CATALOG_ERROR } from './catalog.constants.js';
import {
  MODEL_CAPABILITY_EVIDENCE_ID_PREFIX,
  ERROR_CODE_SEPARATOR,
  SHA256_DIGEST_PATTERN,
  STRING_INDEX_NOT_FOUND,
} from './model-capability-evidence.constants.js';
import type {
  ModelCapabilityEvidenceCheck,
  ModelCapabilityEvidenceInput,
  ModelCapabilityEvidenceReceipt,
} from './model-capability-evidence.types.js';
import { modelCapabilityEvidence } from './schema.constants.js';

interface EvidenceProfileIdentity {
  readonly id: string;
  readonly roleId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly variant?: string | null;
}

function required(value: string, field: string): void {
  if (value.trim().length === EMPTY_SIZE) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_MODEL_EVIDENCE, `${field} is required`);
  }
}

function timestamp(value: string, field: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_MODEL_EVIDENCE, `${field} must be an ISO timestamp`);
  }
  return result;
}

function validateInput(input: ModelCapabilityEvidenceInput): void {
  required(input.providerId, 'providerId');
  required(input.modelId, 'modelId');
  required(input.capabilityId, 'capabilityId');
  required(input.evidenceRef, 'evidenceRef');
  if (!SHA256_DIGEST_PATTERN.test(input.evidenceDigest)) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_MODEL_EVIDENCE, 'evidenceDigest must be a SHA-256 digest');
  }
  if (timestamp(input.assessedAt, 'assessedAt') >= timestamp(input.expiresAt, 'expiresAt')) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_MODEL_EVIDENCE, 'expiresAt must be after assessedAt');
  }
}

export function addModelCapabilityEvidence(
  store: Store,
  input: ModelCapabilityEvidenceInput,
): ModelCapabilityEvidenceReceipt {
  validateInput(input);
  const receipt: ModelCapabilityEvidenceReceipt = {
    ...input,
    id: `${MODEL_CAPABILITY_EVIDENCE_ID_PREFIX}${uuidv7()}`,
    createdAt: new Date().toISOString(),
  };
  store.orm.insert(modelCapabilityEvidence).values({
    ...receipt,
    variant: receipt.variant ?? null,
  }).run();
  return receipt;
}

function capabilityForRole(store: Store, roleId: string): string {
  const role = store.orm.select({ capabilityId: roleContracts.minimumModelCapability }).from(roleContracts)
    .where(eq(roleContracts.roleId, roleId)).get();
  if (role === undefined) {
    throw new ContextError(ROLE_CATALOG_ERROR.UNKNOWN_ROLE, `unknown role: ${roleId}`);
  }
  return role.capabilityId;
}

function evidenceForProfile(
  store: Store,
  profile: Pick<EvidenceProfileIdentity, 'providerId' | 'modelId' | 'variant'>,
  capabilityId: string,
) {
  const variantCondition = profile.variant === undefined || profile.variant === null
    ? isNull(modelCapabilityEvidence.variant)
    : eq(modelCapabilityEvidence.variant, profile.variant);
  return store.orm.select().from(modelCapabilityEvidence).where(and(
    eq(modelCapabilityEvidence.providerId, profile.providerId),
    eq(modelCapabilityEvidence.modelId, profile.modelId),
    variantCondition,
    eq(modelCapabilityEvidence.capabilityId, capabilityId),
  )).orderBy(asc(modelCapabilityEvidence.assessedAt), asc(modelCapabilityEvidence.id)).all();
}

// Un perfil de ejecución (modelo+provider+variant) sólo puede usarse para
// un rol si hay evidencia REGISTRADA (no asumida) de que ese modelo tiene
// la capability mínima que el rol exige (roleContracts.minimumModelCapability),
// y esa evidencia tiene que estar VIGENTE (assessedAt <= ahora < expiresAt)
// — una evaluación de capacidad de modelo vieja no cuenta como prueba
// permanente, los modelos cambian de comportamiento entre versiones.
function profileViolation(
  store: Store,
  profile: EvidenceProfileIdentity,
  now: Date,
): string | undefined {
  const capabilityId = capabilityForRole(store, profile.roleId);
  const evidence = evidenceForProfile(store, profile, capabilityId);
  const identity = `${profile.providerId}/${profile.modelId}${profile.variant === undefined || profile.variant === null ? '' : `/${profile.variant}`}`;
  if (evidence.length === EMPTY_SIZE) {
    return `${ROLE_CATALOG_ERROR.MODEL_EVIDENCE_MISSING}: ${profile.id} has no ${capabilityId} evidence for ${identity}`;
  }
  const nowMs = now.getTime();
  const current = evidence.some((item) => Date.parse(item.assessedAt) <= nowMs && Date.parse(item.expiresAt) > nowMs);
  return current
    ? undefined
    : `${ROLE_CATALOG_ERROR.MODEL_EVIDENCE_NOT_CURRENT}: ${profile.id} has no current ${capabilityId} evidence for ${identity}`;
}

export function checkModelCapabilityEvidence(store: Store, now = new Date()): ModelCapabilityEvidenceCheck {
  const profiles = store.orm.select().from(executionProfiles)
    .where(eq(executionProfiles.enabled, true)).orderBy(asc(executionProfiles.id)).all();
  const violations = profiles.flatMap((profile) => {
    const violation = profileViolation(store, profile, now);
    return violation === undefined ? [] : [violation];
  });
  return { valid: violations.length === EMPTY_SIZE, violations };
}

// Llamado desde dispatchRun() (gateway.ts, flujo 8) antes de contactar al
// adapter: si el perfil de ejecución no tiene evidencia vigente, el
// dispatch se rechaza ACÁ, antes de gastar un turno de agente real con un
// modelo que nunca se demostró capaz de la tarea.
export function requireExecutionProfileModelEvidence(
  store: Store,
  profile: ExecutionProfile,
  now = new Date(),
): void {
  const violation = profileViolation(store, profile, now);
  if (violation === undefined) return;
  const separator = violation.indexOf(ERROR_CODE_SEPARATOR);
  const code = separator === STRING_INDEX_NOT_FOUND
    ? ROLE_CATALOG_ERROR.INVALID_MODEL_EVIDENCE
    : violation.slice(0, separator);
  throw new ContextError(code, violation.slice(separator + 1).trim());
}
