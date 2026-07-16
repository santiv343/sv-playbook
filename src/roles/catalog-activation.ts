import { asc, eq, max } from 'drizzle-orm';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { checkRoleCatalog } from './catalog.js';
import {
  ROLE_CATALOG_ACTIVATION_KEY,
  ROLE_CATALOG_INITIAL_VERSION,
  ROLE_CATALOG_VERSION_INCREMENT,
} from './catalog-activation.constants.js';
import type { RoleCatalogActivationReceipt } from './catalog-activation.types.js';
import { ROLE_CATALOG_ERROR } from './catalog.constants.js';
import {
  modelCapabilities,
  requiredRoles,
  responsibilities,
  roleCatalogProfile,
  roleCatalogActivation,
  roleCatalogVersions,
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

export function roleCatalogSnapshot(store: Store) {
  return {
    responsibilities: store.orm.select().from(responsibilities).orderBy(asc(responsibilities.id)).all(),
    runtimeResponsibilities: store.orm.select().from(runtimeResponsibilities)
      .orderBy(asc(runtimeResponsibilities.responsibilityId)).all(),
    roleContracts: store.orm.select().from(roleContracts).orderBy(asc(roleContracts.roleId)).all(),
    operatingProfile: store.orm.select().from(roleCatalogProfile).orderBy(asc(roleCatalogProfile.profileKey)).all(),
    roleResponsibilities: store.orm.select().from(roleResponsibilities)
      .orderBy(asc(roleResponsibilities.roleId), asc(roleResponsibilities.responsibilityId)).all(),
    capabilityRequestClasses: store.orm.select().from(roleCapabilityRequestClasses)
      .orderBy(asc(roleCapabilityRequestClasses.roleId), asc(roleCapabilityRequestClasses.capabilityClass)).all(),
    roleHandoffs: store.orm.select().from(roleHandoffs)
      .orderBy(asc(roleHandoffs.sourceRoleId), asc(roleHandoffs.targetRoleId), asc(roleHandoffs.artifactContractRef)).all(),
    modelCapabilities: store.orm.select().from(modelCapabilities).orderBy(asc(modelCapabilities.id)).all(),
    requiredRoles: store.orm.select().from(requiredRoles).orderBy(asc(requiredRoles.roleId)).all(),
    roleProhibitions: store.orm.select().from(roleProhibitions)
      .orderBy(asc(roleProhibitions.roleId), asc(roleProhibitions.operationId)).all(),
    rolePolicies: store.orm.select().from(rolePolicyDeclarations).orderBy(asc(rolePolicyDeclarations.roleId)).all(),
    selfCorrectionScopes: store.orm.select().from(roleSelfCorrectionScopes)
      .orderBy(asc(roleSelfCorrectionScopes.roleId), asc(roleSelfCorrectionScopes.outputClass)).all(),
    stopConditions: store.orm.select().from(roleStopConditions)
      .orderBy(asc(roleStopConditions.roleId), asc(roleStopConditions.conditionId)).all(),
    escalationClasses: store.orm.select().from(roleEscalationClasses)
      .orderBy(asc(roleEscalationClasses.roleId), asc(roleEscalationClasses.classId)).all(),
  };
}

function currentDigest(store: Store): { readonly definitionJson: string; readonly catalogDigest: string } {
  const definitionJson = canonicalJson(roleCatalogSnapshot(store));
  return { definitionJson, catalogDigest: digest(JSON.parse(definitionJson)) };
}

function activeReceipt(store: Store): RoleCatalogActivationReceipt | undefined {
  const row = store.orm.select({
    version: roleCatalogActivation.catalogVersion,
    catalogDigest: roleCatalogActivation.catalogDigest,
    activatedAt: roleCatalogActivation.activatedAt,
  }).from(roleCatalogActivation)
    .where(eq(roleCatalogActivation.activationKey, ROLE_CATALOG_ACTIVATION_KEY)).get();
  return row;
}

function nextVersion(store: Store): number {
  const row = store.orm.select({ value: max(roleCatalogVersions.version) }).from(roleCatalogVersions).get();
  if (row?.value === null || row?.value === undefined) return ROLE_CATALOG_INITIAL_VERSION;
  return row.value + ROLE_CATALOG_VERSION_INCREMENT;
}

function storedVersion(store: Store, catalogDigest: string): number | undefined {
  return store.orm.select({ version: roleCatalogVersions.version }).from(roleCatalogVersions)
    .where(eq(roleCatalogVersions.catalogDigest, catalogDigest)).get()?.version;
}

export function activateRoleCatalog(store: Store): RoleCatalogActivationReceipt {
  const validation = checkRoleCatalog(store);
  if (!validation.valid) {
    throw new ContextError(ROLE_CATALOG_ERROR.INVALID_CATALOG, validation.violations.join('; '));
  }
  const current = currentDigest(store);
  const active = activeReceipt(store);
  if (active?.catalogDigest === current.catalogDigest) return active;
  const previousVersion = storedVersion(store, current.catalogDigest);
  const receipt: RoleCatalogActivationReceipt = {
    version: previousVersion ?? nextVersion(store),
    catalogDigest: current.catalogDigest,
    activatedAt: new Date().toISOString(),
  };
  store.orm.transaction((transaction) => {
    if (previousVersion === undefined) {
      transaction.insert(roleCatalogVersions).values({
        version: receipt.version,
        definitionJson: current.definitionJson,
        catalogDigest: receipt.catalogDigest,
        createdAt: receipt.activatedAt,
      }).run();
    }
    transaction.insert(roleCatalogActivation).values({
      activationKey: ROLE_CATALOG_ACTIVATION_KEY,
      catalogVersion: receipt.version,
      catalogDigest: receipt.catalogDigest,
      activatedAt: receipt.activatedAt,
    }).onConflictDoUpdate({
      target: roleCatalogActivation.activationKey,
      set: {
        catalogVersion: receipt.version,
        catalogDigest: receipt.catalogDigest,
        activatedAt: receipt.activatedAt,
      },
    }).run();
  });
  return receipt;
}

export function requireActiveRoleCatalog(store: Store): RoleCatalogActivationReceipt {
  const active = activeReceipt(store);
  if (active === undefined) {
    throw new ContextError(ROLE_CATALOG_ERROR.ACTIVE_CATALOG_MISSING, 'role catalog has not been activated');
  }
  if (active.catalogDigest !== currentDigest(store).catalogDigest) {
    throw new ContextError(ROLE_CATALOG_ERROR.ACTIVE_CATALOG_DRIFT, 'active role catalog does not match durable role data');
  }
  return active;
}

export function checkActiveRoleCatalog(store: Store): { readonly valid: boolean; readonly violations: readonly string[] } {
  try {
    requireActiveRoleCatalog(store);
    return { valid: true, violations: [] };
  } catch (error: unknown) {
    if (error instanceof ContextError) {
      return { valid: false, violations: [`${error.code}: ${error.message}`] };
    }
    throw error;
  }
}
