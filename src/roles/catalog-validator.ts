import { asc } from 'drizzle-orm';
import { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS } from '../context/context.constants.js';
import { contextItemCapabilities, contextItems, contextItemSelectors } from '../context/schema.constants.js';
import type { Store } from '../db/store.types.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { RESPONSIBILITY_CLASSIFICATION, SELF_CORRECTION_MODE } from './role.constants.js';
import { ROLE_CATALOG_ACTIVE_PROFILE_COUNT, ROLE_CONTEXT_SELECTOR_DIMENSION } from './catalog.constants.js';
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

function loadCatalogState(store: Store) {
  return {
    contexts: store.orm.select().from(contextItems).orderBy(asc(contextItems.id), asc(contextItems.version)).all(),
    selectors: store.orm.select().from(contextItemSelectors)
      .orderBy(asc(contextItemSelectors.itemId), asc(contextItemSelectors.itemVersion)).all(),
    contextCapabilities: store.orm.select().from(contextItemCapabilities)
      .orderBy(asc(contextItemCapabilities.itemId), asc(contextItemCapabilities.itemVersion),
        asc(contextItemCapabilities.capability)).all(),
    responsibilities: store.orm.select().from(responsibilities).orderBy(asc(responsibilities.id)).all(),
    runtimeResponsibilities: store.orm.select().from(runtimeResponsibilities)
      .orderBy(asc(runtimeResponsibilities.responsibilityId)).all(),
    roles: store.orm.select().from(roleContracts).orderBy(asc(roleContracts.roleId)).all(),
    profiles: store.orm.select().from(roleCatalogProfile).orderBy(asc(roleCatalogProfile.profileKey)).all(),
    roleResponsibilities: store.orm.select().from(roleResponsibilities)
      .orderBy(asc(roleResponsibilities.roleId), asc(roleResponsibilities.responsibilityId)).all(),
    capabilityRequestClasses: store.orm.select().from(roleCapabilityRequestClasses)
      .orderBy(asc(roleCapabilityRequestClasses.roleId), asc(roleCapabilityRequestClasses.capabilityClass)).all(),
    handoffs: store.orm.select().from(roleHandoffs)
      .orderBy(asc(roleHandoffs.sourceRoleId), asc(roleHandoffs.targetRoleId)).all(),
    capabilities: store.orm.select().from(modelCapabilities).orderBy(asc(modelCapabilities.id)).all(),
    requiredRoles: store.orm.select().from(requiredRoles).orderBy(asc(requiredRoles.roleId)).all(),
    prohibitions: store.orm.select().from(roleProhibitions)
      .orderBy(asc(roleProhibitions.roleId), asc(roleProhibitions.operationId)).all(),
    policies: store.orm.select().from(rolePolicyDeclarations).orderBy(asc(rolePolicyDeclarations.roleId)).all(),
    scopes: store.orm.select().from(roleSelfCorrectionScopes)
      .orderBy(asc(roleSelfCorrectionScopes.roleId), asc(roleSelfCorrectionScopes.outputClass)).all(),
    stops: store.orm.select().from(roleStopConditions)
      .orderBy(asc(roleStopConditions.roleId), asc(roleStopConditions.conditionId)).all(),
    escalations: store.orm.select().from(roleEscalationClasses)
      .orderBy(asc(roleEscalationClasses.roleId), asc(roleEscalationClasses.classId)).all(),
  };
}

type CatalogState = ReturnType<typeof loadCatalogState>;

function addViolation(violations: string[], condition: boolean, message: string): void {
  if (condition) violations.push(message);
}

function hasRoleContext(state: CatalogState, role: CatalogState['roles'][number]): boolean {
  const active = state.contexts.some((context) => context.id === role.contextItemId
    && context.version === role.contextItemVersion && context.status === CONTEXT_ITEM_STATUS.ACTIVE);
  return active && state.selectors.some((selector) => selector.itemId === role.contextItemId
    && selector.itemVersion === role.contextItemVersion && selector.dimension === ROLE_CONTEXT_SELECTOR_DIMENSION
    && selector.value === role.roleId);
}

function roleViolations(state: CatalogState): string[] {
  return state.roles.flatMap((role) => {
    const violations: string[] = [];
    const policy = state.policies.find((item) => item.roleId === role.roleId);
    const scopeCount = state.scopes.filter((item) => item.roleId === role.roleId).length;
    addViolation(violations,
      !state.roleResponsibilities.some((item) => item.roleId === role.roleId),
      `${role.roleId}: no exclusive semantic responsibility`);
    addViolation(violations, role.mission.trim().length === EMPTY_SIZE, `${role.roleId}: empty mission`);
    addViolation(violations, role.inputContractRef.trim().length === EMPTY_SIZE, `${role.roleId}: empty input_contract_ref`);
    addViolation(violations, role.outputContractRef.trim().length === EMPTY_SIZE, `${role.roleId}: empty output_contract_ref`);
    addViolation(violations, !hasRoleContext(state, role), `${role.roleId}: role context is not active and role-scoped`);
    addViolation(violations,
      !state.capabilities.some((item) => item.id === role.minimumModelCapability),
      `${role.roleId}: unresolved minimum model capability`);
    const unauthorizedRequests = state.capabilityRequestClasses
      .filter((item) => item.roleId === role.roleId)
      .filter((item) => !state.contextCapabilities.some((capability) => capability.itemId === role.contextItemId
        && capability.itemVersion === role.contextItemVersion && capability.capability === item.capabilityClass
        && capability.effect === CAPABILITY_EFFECT.ALLOW));
    violations.push(...unauthorizedRequests.map((item) =>
      `${role.roleId}: capability request class is not allowed by role context: ${item.capabilityClass}`));
    addViolation(violations,
      !state.prohibitions.some((item) => item.roleId === role.roleId),
      `${role.roleId}: no structured prohibitions`);
    addViolation(violations, policy === undefined, `${role.roleId}: no structured correction policy`);
    addViolation(violations,
      policy?.selfCorrectionMode === SELF_CORRECTION_MODE.BOUNDED && scopeCount === EMPTY_SIZE,
      `${role.roleId}: bounded correction has no output classes`);
    addViolation(violations,
      policy?.selfCorrectionMode === SELF_CORRECTION_MODE.NONE && scopeCount > EMPTY_SIZE,
      `${role.roleId}: correction mode none has output classes`);
    addViolation(violations,
      !state.stops.some((item) => item.roleId === role.roleId),
      `${role.roleId}: no stop condition`);
    return violations;
  });
}

function requiredRoleViolations(state: CatalogState): string[] {
  const required = new Set(state.requiredRoles.map((item) => item.roleId));
  const actual = new Set(state.roles.map((item) => item.roleId));
  if (required.size === EMPTY_SIZE) return ['required role set is not configured'];
  return [
    ...[...required].filter((roleId) => !actual.has(roleId)).map((roleId) => `missing required role: ${roleId}`),
    ...[...actual].filter((roleId) => !required.has(roleId)).map((roleId) => `role outside closed catalog: ${roleId}`),
  ];
}

function profileViolations(state: CatalogState): string[] {
  if (state.profiles.length !== ROLE_CATALOG_ACTIVE_PROFILE_COUNT) {
    return ['role catalog must declare exactly one active operating profile'];
  }
  const profile = state.profiles[0];
  if (profile === undefined) return ['role catalog active operating profile is missing'];
  return state.roles.some((role) => role.roleId === profile.entryRoleId)
    ? []
    : [`${profile.profileId}: entry role does not resolve: ${profile.entryRoleId}`];
}

function ownershipViolations(state: CatalogState): string[] {
  const classification = new Map(state.responsibilities.map((item) => [item.id, item.classification]));
  const owned = new Set(state.roleResponsibilities.map((item) => item.responsibilityId));
  const runtimeOwned = new Set(state.runtimeResponsibilities.map((item) => item.responsibilityId));
  const deterministic = state.roleResponsibilities
    .filter((item) => classification.get(item.responsibilityId) === RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC)
    .map((item) => `${item.roleId}: owns deterministic ${item.responsibilityId}`);
  const uncovered = state.responsibilities.flatMap((item) => {
    if (item.classification === RESPONSIBILITY_CLASSIFICATION.SEMANTIC && !owned.has(item.id)) {
      return [`unowned semantic responsibility: ${item.id}`];
    }
    if (item.classification === RESPONSIBILITY_CLASSIFICATION.DETERMINISTIC && !runtimeOwned.has(item.id)) {
      return [`unowned deterministic responsibility: ${item.id}`];
    }
    return [];
  });
  return [...deterministic, ...uncovered];
}

function routingViolations(state: CatalogState): string[] {
  const perRole = state.roles.flatMap((role) => {
    const violations: string[] = [];
    if (!state.handoffs.some((handoff) => handoff.sourceRoleId === role.roleId
      && handoff.artifactContractRef === role.outputContractRef)) {
      violations.push(`${role.roleId}: output contract has no handoff`);
    }
    if (!state.escalations.some((item) => item.roleId === role.roleId)) {
      violations.push(`${role.roleId}: no escalation condition`);
    }
    return violations;
  });
  const incompatible = state.handoffs.flatMap((handoff) => {
    const source = state.roles.find((role) => role.roleId === handoff.sourceRoleId);
    const target = state.roles.find((role) => role.roleId === handoff.targetRoleId);
    if (source === undefined || target === undefined) {
      return [`${handoff.sourceRoleId}->${handoff.targetRoleId}: unresolved handoff role`];
    }
    return source.outputContractRef === handoff.artifactContractRef
      && target.inputContractRef === handoff.artifactContractRef
      ? []
      : [`${handoff.sourceRoleId}->${handoff.targetRoleId}: incompatible handoff contract ${handoff.artifactContractRef}`];
  });
  return [...perRole, ...incompatible];
}

export function validateRoleCatalog(store: Store): readonly string[] {
  const state = loadCatalogState(store);
  return [
    ...roleViolations(state),
    ...ownershipViolations(state),
    ...routingViolations(state),
    ...requiredRoleViolations(state),
    ...profileViolations(state),
  ];
}
