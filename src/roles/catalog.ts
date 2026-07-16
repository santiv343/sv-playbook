import { asc, eq } from 'drizzle-orm';
import { checkArtifactContracts } from '../contracts/artifacts.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { EMPTY_SIZE, REFERENCE_SEPARATOR_WIDTH, REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import { checkModelCapabilityEvidence } from './model-capability-evidence.js';
import { ROLE_CATALOG_ERROR, ROLE_CATALOG_PROFILE_KEY } from './catalog.constants.js';
import type {
  ModelCapabilityInput,
  ResponsibilityInput,
  RoleCatalogCheck,
  RoleCatalogEntry,
  RoleCatalogProfileInput,
  RoleContractInput,
  RoleEscalationInput,
  RoleHandoffInput,
  RolePolicyInput,
} from './catalog.types.js';
import { validateRoleCatalog } from './catalog-validator.js';
import {
  RESPONSIBILITY_CLASSIFICATION,
  ROLE_DEFINITION_INITIAL_VERSION,
  ROLE_DEFINITION_VERSION_INCREMENT,
  SELF_CORRECTION_MODE,
} from './role.constants.js';
import {
  modelCapabilities,
  requiredRoles,
  responsibilities,
  roleCatalogProfile,
  roleCapabilityRequestClasses,
  roleContracts,
  roleEscalationClasses,
  roleHandoffs,
  rolePolicyDeclarations,
  roleProhibitions,
  roleResponsibilities,
  roleSelfCorrectionScopes,
  roleStopConditions,
  runtimeResponsibilities,
} from './schema.constants.js';

const ROLE_CONTEXT_MIN_VERSION = 1;

function refParts(ref: string): { readonly id: string; readonly version: number } {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  const version = Number(ref.slice(separator + REFERENCE_SEPARATOR_WIDTH));
  if (separator < REFERENCE_SEPARATOR_WIDTH || !Number.isInteger(version) || version < ROLE_CONTEXT_MIN_VERSION) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_REFERENCE, `invalid context reference: ${ref}`);
  }
  return { id: ref.slice(EMPTY_SIZE, separator), version };
}

export function addResponsibility(store: Store, responsibility: ResponsibilityInput): void {
  store.orm.transaction((transaction) => {
    transaction.insert(responsibilities).values(responsibility).run();
    if (responsibility.classification === RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC) {
      transaction.insert(runtimeResponsibilities).values({ responsibilityId: responsibility.id }).run();
    }
  });
}

function responsibilityClassification(store: Store, id: string): string {
  const row = store.orm.select({ classification: responsibilities.classification }).from(responsibilities)
    .where(eq(responsibilities.id, id)).get();
  if (row === undefined) throw new ContextError(ROLE_CATALOG_ERROR.UNKNOWN_RESPONSIBILITY, `unknown responsibility: ${id}`);
  return row.classification;
}

export function addRoleContract(store: Store, contract: RoleContractInput): void {
  const judgments = normalized(contract.exclusiveJudgments);
  const capabilityRequestClasses = normalized(contract.capabilityRequestClasses);
  const deterministic = judgments.filter((id) =>
    responsibilityClassification(store, id) === RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC);
  if (deterministic.length > EMPTY_SIZE) {
    throw new ContextError(ROLE_CATALOG_ERROR.DETERMINISTIC_RESPONSIBILITY,
      `${contract.roleId} cannot own deterministic responsibilities: ${deterministic.join(', ')}`);
  }
  if (judgments.length === EMPTY_SIZE) {
    throw new ContextError('ROLE_WITHOUT_RESPONSIBILITY', `${contract.roleId} must own at least one semantic responsibility`);
  }
  if (contract.mission.trim().length === EMPTY_SIZE) {
    throw new ContextError('ROLE_WITHOUT_MISSION', `${contract.roleId} must declare a mission`);
  }
  const context = refParts(contract.contextItemRef);
  store.orm.transaction((transaction) => {
    transaction.insert(roleContracts).values({
      roleId: contract.roleId,
      definitionVersion: ROLE_DEFINITION_INITIAL_VERSION,
      mission: contract.mission.trim(),
      contextItemId: context.id,
      contextItemVersion: context.version,
      inputContractRef: contract.inputContractRef,
      outputContractRef: contract.outputContractRef,
      minimumModelCapability: contract.minimumModelCapability,
    }).run();
    transaction.insert(roleResponsibilities).values(judgments.map((responsibilityId) => ({
      roleId: contract.roleId,
      responsibilityId,
    }))).run();
    if (capabilityRequestClasses.length > EMPTY_SIZE) {
      transaction.insert(roleCapabilityRequestClasses).values(capabilityRequestClasses.map((capabilityClass) => ({
        roleId: contract.roleId,
        capabilityClass,
      }))).run();
    }
  });
}

export function setRoleContract(store: Store, contract: RoleContractInput): void {
  const current = store.orm.select({ version: roleContracts.definitionVersion }).from(roleContracts)
    .where(eq(roleContracts.roleId, contract.roleId)).get();
  if (current === undefined) {
    addRoleContract(store, contract);
    return;
  }
  const judgments = normalized(contract.exclusiveJudgments);
  const capabilityRequestClasses = normalized(contract.capabilityRequestClasses);
  const deterministic = judgments.filter((id) =>
    responsibilityClassification(store, id) === RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC);
  if (deterministic.length > EMPTY_SIZE) {
    throw new ContextError(ROLE_CATALOG_ERROR.DETERMINISTIC_RESPONSIBILITY,
      `${contract.roleId} cannot own deterministic responsibilities: ${deterministic.join(', ')}`);
  }
  if (judgments.length === EMPTY_SIZE || contract.mission.trim().length === EMPTY_SIZE) {
    throw new ContextError('INCOMPLETE_ROLE_CONTRACT', `${contract.roleId} requires a mission and exclusive judgments`);
  }
  const context = refParts(contract.contextItemRef);
  store.orm.transaction((transaction) => {
    transaction.update(roleContracts).set({
      definitionVersion: current.version + ROLE_DEFINITION_VERSION_INCREMENT,
      mission: contract.mission.trim(),
      contextItemId: context.id,
      contextItemVersion: context.version,
      inputContractRef: contract.inputContractRef,
      outputContractRef: contract.outputContractRef,
      minimumModelCapability: contract.minimumModelCapability,
    }).where(eq(roleContracts.roleId, contract.roleId)).run();
    transaction.delete(roleResponsibilities).where(eq(roleResponsibilities.roleId, contract.roleId)).run();
    transaction.delete(roleCapabilityRequestClasses)
      .where(eq(roleCapabilityRequestClasses.roleId, contract.roleId)).run();
    transaction.insert(roleResponsibilities).values(judgments.map((responsibilityId) => ({
      roleId: contract.roleId,
      responsibilityId,
    }))).run();
    if (capabilityRequestClasses.length > EMPTY_SIZE) {
      transaction.insert(roleCapabilityRequestClasses).values(capabilityRequestClasses.map((capabilityClass) => ({
        roleId: contract.roleId,
        capabilityClass,
      }))).run();
    }
  });
}

export function addRoleHandoff(store: Store, handoff: RoleHandoffInput): void {
  if (handoff.sourceRoleId === handoff.targetRoleId) {
    throw new ContextError(ROLE_CATALOG_ERROR.SELF_HANDOFF, `${handoff.sourceRoleId} cannot hand off to itself`);
  }
  store.orm.insert(roleHandoffs).values(handoff).run();
}

export function addRoleEscalation(store: Store, escalation: RoleEscalationInput): void {
  if (escalation.classId.trim().length === EMPTY_SIZE) {
    throw new ContextError('INVALID_ESCALATION_CLASS', 'escalation class is required');
  }
  store.orm.insert(roleEscalationClasses).values({ roleId: escalation.roleId, classId: escalation.classId }).run();
}

export function addModelCapability(store: Store, capability: ModelCapabilityInput): void {
  if (capability.id.trim().length === EMPTY_SIZE || capability.description.trim().length === EMPTY_SIZE) {
    throw new ContextError('INVALID_MODEL_CAPABILITY', 'model capability id and description are required');
  }
  store.orm.insert(modelCapabilities).values(capability).run();
}

export function requireRole(store: Store, roleId: string): void {
  store.orm.insert(requiredRoles).values({ roleId }).run();
}

export function setRoleCatalogProfile(store: Store, profile: RoleCatalogProfileInput): void {
  if (profile.profileId.trim().length === EMPTY_SIZE || profile.entryRoleId.trim().length === EMPTY_SIZE) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_CATALOG, 'profile id and entry role are required');
  }
  const entryRole = store.orm.select({ roleId: roleContracts.roleId }).from(roleContracts)
    .where(eq(roleContracts.roleId, profile.entryRoleId)).get();
  if (entryRole === undefined) {
    throw new ContextError(ROLE_CATALOG_ERROR.UNKNOWN_ROLE, `unknown entry role: ${profile.entryRoleId}`);
  }
  store.orm.insert(roleCatalogProfile).values({ profileKey: ROLE_CATALOG_PROFILE_KEY, ...profile })
    .onConflictDoUpdate({
      target: roleCatalogProfile.profileKey,
      set: {
        profileId: profile.profileId,
        entryRoleId: profile.entryRoleId,
        sourceKind: profile.sourceKind,
      },
    }).run();
}

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > EMPTY_SIZE))].sort();
}

function validateRolePolicy(policy: RolePolicyInput, prohibitions: readonly string[], scopes: readonly string[]): void {
  if (prohibitions.length === EMPTY_SIZE) throw new ContextError('ROLE_WITHOUT_PROHIBITIONS', `${policy.roleId} must declare prohibitions`);
  if (policy.selfCorrectionMode === SELF_CORRECTION_MODE.NONE && scopes.length > EMPTY_SIZE) {
    throw new ContextError('INVALID_CORRECTION_POLICY', `${policy.roleId} declares correction scopes with mode none`);
  }
  if (policy.selfCorrectionMode === SELF_CORRECTION_MODE.BOUNDED && scopes.length === EMPTY_SIZE) {
    throw new ContextError('INVALID_CORRECTION_POLICY', `${policy.roleId} bounded correction requires output classes`);
  }
  if (normalized(policy.stopConditions).length === EMPTY_SIZE || normalized(policy.escalationClasses).length === EMPTY_SIZE) {
    throw new ContextError('INCOMPLETE_ROLE_POLICY', `${policy.roleId} must declare stop conditions and escalation classes`);
  }
}

export function setRolePolicy(store: Store, policy: RolePolicyInput): void {
  const prohibitions = normalized(policy.prohibitions);
  const scopes = normalized(policy.selfCorrectionScopes);
  const stopConditions = normalized(policy.stopConditions);
  const escalationClasses = normalized(policy.escalationClasses);
  validateRolePolicy(policy, prohibitions, scopes);
  store.orm.transaction((transaction) => {
    transaction.insert(roleProhibitions).values(prohibitions.map((operationId) => ({ roleId: policy.roleId, operationId }))).run();
    transaction.insert(rolePolicyDeclarations).values({
      roleId: policy.roleId,
      selfCorrectionMode: policy.selfCorrectionMode,
    }).run();
    if (scopes.length > EMPTY_SIZE) {
      transaction.insert(roleSelfCorrectionScopes).values(scopes.map((outputClass) => ({ roleId: policy.roleId, outputClass }))).run();
    }
    transaction.insert(roleStopConditions).values(stopConditions.map((conditionId) => ({ roleId: policy.roleId, conditionId }))).run();
    transaction.insert(roleEscalationClasses).values(escalationClasses.map((classId) => ({ roleId: policy.roleId, classId }))).run();
  });
}

export function checkRoleCatalog(store: Store): RoleCatalogCheck {
  const violations = [
    ...validateRoleCatalog(store),
    ...checkArtifactContracts(store).violations,
    ...checkModelCapabilityEvidence(store).violations,
  ];
  return { valid: violations.length === EMPTY_SIZE, violations };
}

export function listRoleCatalog(store: Store): RoleCatalogEntry[] {
  const required = new Set(store.orm.select().from(requiredRoles).orderBy(asc(requiredRoles.roleId)).all()
    .map((item) => item.roleId));
  const judgments = store.orm.select().from(roleResponsibilities)
    .orderBy(asc(roleResponsibilities.roleId), asc(roleResponsibilities.responsibilityId)).all();
  const capabilityRequests = store.orm.select().from(roleCapabilityRequestClasses)
    .orderBy(asc(roleCapabilityRequestClasses.roleId), asc(roleCapabilityRequestClasses.capabilityClass)).all();
  return store.orm.select().from(roleContracts).orderBy(asc(roleContracts.roleId)).all().map((role) => ({
    roleId: role.roleId,
    definitionVersion: role.definitionVersion,
    mission: role.mission,
    required: required.has(role.roleId),
    inputContractRef: role.inputContractRef,
    outputContractRef: role.outputContractRef,
    minimumModelCapability: role.minimumModelCapability,
    exclusiveJudgments: judgments.filter((item) => item.roleId === role.roleId)
      .map((item) => item.responsibilityId),
    capabilityRequestClasses: capabilityRequests.filter((item) => item.roleId === role.roleId)
      .map((item) => item.capabilityClass),
  }));
}
