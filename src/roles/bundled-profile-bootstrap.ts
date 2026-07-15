import { and, eq, inArray } from 'drizzle-orm';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { canonicalJson, digest } from '../context/digest.js';
import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import {
  contextItemCapabilities,
  contextItems,
  contextItemSelectors,
  contextPrecedence,
} from '../context/schema.constants.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import type { StoreOrm } from '../db/orm.types.js';
import { artifactContracts } from '../orchestration/schema.constants.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { JSON_SCHEMA_DRAFT_2020_12, JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';
import { activateRoleCatalog } from './catalog-activation.js';
import {
  BUNDLED_ROLE_BOOTSTRAP_KEY,
  BUNDLED_ROLE_BOOTSTRAP_MODE,
  BUNDLED_ROLE_CONTEXT_ID_PREFIX,
  BUNDLED_ROLE_CONTEXT_KIND,
  BUNDLED_ROLE_CONTEXT_PRECEDENCE_INITIAL_RANK,
  BUNDLED_ROLE_CONTEXT_PRECEDENCE_STEP,
  BUNDLED_ROLE_CONTEXT_VERSION,
  BUNDLED_ROLE_PROFILE,
} from './bundled-profile.constants.js';
import type {
  BundledRoleBootstrapMode,
  BundledRoleBootstrapReceipt,
} from './bundled-profile-bootstrap.types.js';
import type { BundledRoleDefinition } from './bundled-profile.types.js';
import { ROLE_CATALOG_PROFILE_KEY, ROLE_CATALOG_PROFILE_SOURCE } from './catalog.constants.js';
import {
  RESPONSIBILITY_CLASSIFICATION,
  ROLE_DEFINITION_INITIAL_VERSION,
  ROLE_DEFINITION_VERSION_INCREMENT,
} from './role.constants.js';
import {
  modelCapabilities,
  requiredRoles,
  responsibilities,
  roleCapabilityRequestClasses,
  roleCatalogBootstrapReceipts,
  roleCatalogProfile,
  roleContracts,
  roleEscalationClasses,
  roleHandoffs,
  rolePolicyDeclarations,
  roleProhibitions,
  roleResponsibilities,
  roleSelfCorrectionScopes,
  roleStopConditions,
} from './schema.constants.js';
import { ensureBundledInputPolicies } from './bundled-input-policies.js';

const BUNDLED_CONTEXT_PROVENANCE = 'bundled-role-profile';
const BUNDLED_ROLE_SELECTOR = 'role';
const BUNDLED_ARTIFACT_SCHEMA = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  type: JSON_SCHEMA_TYPE.OBJECT,
  required: ['kind', 'payload'],
  properties: {
    kind: { type: JSON_SCHEMA_TYPE.STRING, minLength: 1 },
    payload: { type: JSON_SCHEMA_TYPE.OBJECT },
  },
  additionalProperties: false,
} as const;

type RoleSeedTransaction = Parameters<Parameters<StoreOrm['transaction']>[0]>[0];

function contextId(roleId: string): string {
  return `${BUNDLED_ROLE_CONTEXT_ID_PREFIX}${roleId.toUpperCase()}`;
}

function ensureBundledContextPrecedence(store: Store): void {
  const rows = store.orm.select().from(contextPrecedence).all();
  if (rows.some(({ kind }) => kind === BUNDLED_ROLE_CONTEXT_KIND)) return;
  const lowestRank = rows.reduce(
    (lowest, { rank }) => Math.min(lowest, rank),
    BUNDLED_ROLE_CONTEXT_PRECEDENCE_INITIAL_RANK,
  );
  const rank = rows.length === EMPTY_SIZE
    ? BUNDLED_ROLE_CONTEXT_PRECEDENCE_INITIAL_RANK
    : lowestRank - BUNDLED_ROLE_CONTEXT_PRECEDENCE_STEP;
  store.orm.insert(contextPrecedence).values({ kind: BUNDLED_ROLE_CONTEXT_KIND, rank }).run();
}

function validateBundledProfile(): void {
  const roleIds = BUNDLED_ROLE_PROFILE.roles.map((role) => role.id);
  const uniqueRoleIds = new Set(roleIds);
  if (uniqueRoleIds.size !== roleIds.length || !uniqueRoleIds.has(BUNDLED_ROLE_PROFILE.entryRoleId)) {
    throw new ContextError('INVALID_BUNDLED_ROLE_PROFILE', 'role ids must be unique and include the entry role');
  }
  const invalidHandoff = BUNDLED_ROLE_PROFILE.handoffs.find((handoff) =>
    handoff.sourceRoleId === handoff.targetRoleId
      || !uniqueRoleIds.has(handoff.sourceRoleId)
      || !uniqueRoleIds.has(handoff.targetRoleId));
  if (invalidHandoff !== undefined) {
    throw new ContextError('INVALID_BUNDLED_ROLE_PROFILE', 'handoffs must reference different bundled roles');
  }
}

function existingReceipt(store: Store): BundledRoleBootstrapReceipt | undefined {
  return store.orm.select({
    profileId: roleCatalogBootstrapReceipts.profileId,
    profileDigest: roleCatalogBootstrapReceipts.profileDigest,
    catalogVersion: roleCatalogBootstrapReceipts.catalogVersion,
    catalogDigest: roleCatalogBootstrapReceipts.catalogDigest,
    createdAt: roleCatalogBootstrapReceipts.createdAt,
  }).from(roleCatalogBootstrapReceipts)
    .where(eq(roleCatalogBootstrapReceipts.bootstrapKey, BUNDLED_ROLE_BOOTSTRAP_KEY)).get();
}

interface BootstrapAvailability {
  readonly mode: BundledRoleBootstrapMode;
  readonly receipt?: BundledRoleBootstrapReceipt;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resumableBundledProfile(store: Store): boolean {
  const profile = store.orm.select().from(roleCatalogProfile)
    .where(eq(roleCatalogProfile.profileKey, ROLE_CATALOG_PROFILE_KEY)).get();
  return profile?.profileId === BUNDLED_ROLE_PROFILE.id
    && profile.entryRoleId === BUNDLED_ROLE_PROFILE.entryRoleId
    && profile.sourceKind === ROLE_CATALOG_PROFILE_SOURCE.BUNDLED;
}

function assertBootstrapAvailable(store: Store, profileDigest: string): BootstrapAvailability {
  const existing = existingReceipt(store);
  if (existing !== undefined) {
    if (existing.profileDigest !== profileDigest) {
      throw new ContextError('BUNDLED_ROLE_PROFILE_DRIFT', 'stored bootstrap receipt has a different profile digest');
    }
    return { mode: BUNDLED_ROLE_BOOTSTRAP_MODE.RESUME, receipt: existing };
  }
  const existingRoleIds = store.orm.select({ roleId: roleContracts.roleId }).from(roleContracts).all()
    .map(({ roleId }) => roleId).sort();
  if (existingRoleIds.length === EMPTY_SIZE) return { mode: BUNDLED_ROLE_BOOTSTRAP_MODE.EMPTY };
  const bundledRoleIds = BUNDLED_ROLE_PROFILE.roles.map(({ id }) => id).sort();
  if (!sameValues(existingRoleIds, bundledRoleIds)) {
    throw new ContextError('ROLE_BOOTSTRAP_CATALOG_MISMATCH',
      'existing role ids do not exactly match the bundled profile');
  }
  return {
    mode: resumableBundledProfile(store)
      ? BUNDLED_ROLE_BOOTSTRAP_MODE.RESUME
      : BUNDLED_ROLE_BOOTSTRAP_MODE.RECONCILE,
  };
}

function insertRoleContext(
  transaction: RoleSeedTransaction,
  role: BundledRoleDefinition,
  createdAt: string,
): void {
  const itemId = contextId(role.id);
  transaction.insert(contextItems).values({
    id: itemId,
    version: BUNDLED_ROLE_CONTEXT_VERSION,
    kind: BUNDLED_ROLE_CONTEXT_KIND,
    status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
    semanticKey: `role.${role.id}`,
    body: role.mission,
    provenance: BUNDLED_CONTEXT_PROVENANCE,
    createdAt,
    updatedAt: createdAt,
  }).onConflictDoNothing().run();
  transaction.insert(contextItemSelectors).values({
    itemId, itemVersion: BUNDLED_ROLE_CONTEXT_VERSION, dimension: BUNDLED_ROLE_SELECTOR, value: role.id,
  }).onConflictDoNothing().run();
  if (role.capabilityRequestClasses.length > EMPTY_SIZE) {
    transaction.insert(contextItemCapabilities).values(role.capabilityRequestClasses.map((capability) => ({
      itemId, itemVersion: BUNDLED_ROLE_CONTEXT_VERSION, capability, effect: CAPABILITY_EFFECT.ALLOW,
    }))).onConflictDoNothing().run();
  }
}

function writeRoleDefinition(
  transaction: RoleSeedTransaction,
  role: BundledRoleDefinition,
  mode: BundledRoleBootstrapMode,
  currentVersions: ReadonlyMap<string, number>,
): void {
  transaction.insert(responsibilities).values({
    id: role.exclusiveJudgment,
    classification: RESPONSIBILITY_CLASSIFICATION.SEMANTIC,
    description: role.mission,
  }).onConflictDoUpdate({
    target: responsibilities.id,
    set: { classification: RESPONSIBILITY_CLASSIFICATION.SEMANTIC, description: role.mission },
  }).run();
  const contract = {
    roleId: role.id,
    definitionVersion: ROLE_DEFINITION_INITIAL_VERSION,
    mission: role.mission,
    contextItemId: contextId(role.id),
    contextItemVersion: BUNDLED_ROLE_CONTEXT_VERSION,
    inputContractRef: BUNDLED_ROLE_PROFILE.artifactContractRef,
    outputContractRef: BUNDLED_ROLE_PROFILE.artifactContractRef,
    minimumModelCapability: BUNDLED_ROLE_PROFILE.modelCapabilityId,
  };
  if (mode === BUNDLED_ROLE_BOOTSTRAP_MODE.EMPTY) {
    transaction.insert(roleContracts).values(contract).run();
  } else {
    const currentVersion = currentVersions.get(role.id);
    if (currentVersion === undefined) {
      throw new ContextError('ROLE_BOOTSTRAP_CATALOG_MISMATCH', `missing existing role: ${role.id}`);
    }
    transaction.update(roleContracts).set({
      ...contract,
      definitionVersion: currentVersion + ROLE_DEFINITION_VERSION_INCREMENT,
    }).where(eq(roleContracts.roleId, role.id)).run();
  }
  transaction.insert(roleResponsibilities).values({
    roleId: role.id, responsibilityId: role.exclusiveJudgment,
  }).run();
  if (role.capabilityRequestClasses.length > EMPTY_SIZE) {
    transaction.insert(roleCapabilityRequestClasses).values(role.capabilityRequestClasses.map((capabilityClass) => ({
      roleId: role.id, capabilityClass,
    }))).run();
  }
  transaction.insert(requiredRoles).values({ roleId: role.id }).run();
}

function insertRolePolicy(transaction: RoleSeedTransaction, role: BundledRoleDefinition): void {
  transaction.insert(roleProhibitions).values(role.policy.prohibitions.map((operationId) => ({
    roleId: role.id, operationId,
  }))).run();
  transaction.insert(rolePolicyDeclarations).values({
    roleId: role.id, selfCorrectionMode: role.policy.selfCorrectionMode,
  }).run();
  transaction.insert(roleSelfCorrectionScopes).values(role.policy.selfCorrectionScopes.map((outputClass) => ({
    roleId: role.id, outputClass,
  }))).run();
  transaction.insert(roleStopConditions).values(role.policy.stopConditions.map((conditionId) => ({
    roleId: role.id, conditionId,
  }))).run();
  transaction.insert(roleEscalationClasses).values(role.policy.escalationClasses.map((classId) => ({
    roleId: role.id, classId,
  }))).run();
}

function clearLegacyRoleRelations(transaction: RoleSeedTransaction): Map<string, number> {
  const versions = new Map(transaction.select({
    roleId: roleContracts.roleId,
    definitionVersion: roleContracts.definitionVersion,
  }).from(roleContracts).all().map((row) => [row.roleId, row.definitionVersion] as const));
  const oldJudgments = transaction.select({ responsibilityId: roleResponsibilities.responsibilityId })
    .from(roleResponsibilities).all().map(({ responsibilityId }) => responsibilityId);
  transaction.delete(roleHandoffs).run();
  transaction.delete(roleCapabilityRequestClasses).run();
  transaction.delete(roleResponsibilities).run();
  transaction.delete(requiredRoles).run();
  transaction.delete(roleProhibitions).run();
  transaction.delete(rolePolicyDeclarations).run();
  transaction.delete(roleSelfCorrectionScopes).run();
  transaction.delete(roleStopConditions).run();
  transaction.delete(roleEscalationClasses).run();
  transaction.delete(roleCatalogProfile).run();
  if (oldJudgments.length > EMPTY_SIZE) {
    transaction.delete(responsibilities).where(and(
      inArray(responsibilities.id, oldJudgments),
      eq(responsibilities.classification, RESPONSIBILITY_CLASSIFICATION.SEMANTIC),
    )).run();
  }
  return versions;
}

function seedBundledRoleCatalog(
  store: Store,
  createdAt: string,
  mode: BundledRoleBootstrapMode,
): void {
  store.orm.transaction((transaction) => {
    const currentVersions = mode === BUNDLED_ROLE_BOOTSTRAP_MODE.RECONCILE
      ? clearLegacyRoleRelations(transaction)
      : new Map<string, number>();
    transaction.insert(artifactContracts).values({
      ref: BUNDLED_ROLE_PROFILE.artifactContractRef,
      schemaJson: canonicalJson(BUNDLED_ARTIFACT_SCHEMA),
      schemaDigest: digest(BUNDLED_ARTIFACT_SCHEMA),
      status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
      createdAt,
    }).onConflictDoNothing().run();
    transaction.insert(modelCapabilities).values({
      id: BUNDLED_ROLE_PROFILE.modelCapabilityId,
      description: 'Can perform the semantic judgment required by the selected role.',
    }).onConflictDoNothing().run();
    for (const role of BUNDLED_ROLE_PROFILE.roles) {
      insertRoleContext(transaction, role, createdAt);
      writeRoleDefinition(transaction, role, mode, currentVersions);
      insertRolePolicy(transaction, role);
    }
    transaction.insert(roleHandoffs).values(BUNDLED_ROLE_PROFILE.handoffs.map((handoff) => ({
      ...handoff,
      artifactContractRef: BUNDLED_ROLE_PROFILE.artifactContractRef,
    }))).run();
    transaction.insert(roleCatalogProfile).values({
      profileKey: ROLE_CATALOG_PROFILE_KEY,
      profileId: BUNDLED_ROLE_PROFILE.id,
      entryRoleId: BUNDLED_ROLE_PROFILE.entryRoleId,
      sourceKind: ROLE_CATALOG_PROFILE_SOURCE.BUNDLED,
    }).run();
  });
}

export function bootstrapBundledRoleCatalog(store: Store): BundledRoleBootstrapReceipt {
  validateBundledProfile();
  const profileDigest = digest(BUNDLED_ROLE_PROFILE);
  const availability = assertBootstrapAvailable(store, profileDigest);
  ensureBundledContextPrecedence(store);
  if (availability.receipt !== undefined) {
    ensureBundledInputPolicies(store);
    return availability.receipt;
  }
  const createdAt = new Date().toISOString();
  if (availability.mode !== BUNDLED_ROLE_BOOTSTRAP_MODE.RESUME) {
    seedBundledRoleCatalog(store, createdAt, availability.mode);
  }
  ensureBundledInputPolicies(store);
  const activation = activateRoleCatalog(store);
  const receipt: BundledRoleBootstrapReceipt = {
    profileId: BUNDLED_ROLE_PROFILE.id,
    profileDigest,
    catalogVersion: activation.version,
    catalogDigest: activation.catalogDigest,
    createdAt,
  };
  store.orm.insert(roleCatalogBootstrapReceipts).values({
    bootstrapKey: BUNDLED_ROLE_BOOTSTRAP_KEY,
    ...receipt,
  }).run();
  return receipt;
}
