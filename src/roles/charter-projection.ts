import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { roleProjectionReceiptViolations } from '../gateway/adapters/role-projection-receipt.js';
import type {
  RoleProjectionArtifact,
  RoleProjectionCandidate,
} from '../gateway/adapters/role-projection.types.js';
import { EMPTY_SIZE, TEXT_ENCODING } from '../platform.constants.js';
import { requireActiveRoleCatalog, roleCatalogSnapshot } from './catalog-activation.js';
import {
  ROLE_CHARTER_PROJECTION_ADAPTER_ID,
  ROLE_CHARTER_PROJECTION_ERROR,
  ROLE_CHARTER_PROJECTION_PATH,
} from './charter-projection.constants.js';
import { SELF_CORRECTION_MODE } from './role.constants.js';

type RoleCatalogSnapshot = ReturnType<typeof roleCatalogSnapshot>;
type RoleContract = RoleCatalogSnapshot['roleContracts'][number];

function roleValues<T extends { readonly roleId: string }>(
  rows: readonly T[],
  roleId: string,
  value: (row: T) => string,
): string[] {
  return rows.filter((row) => row.roleId === roleId).map(value);
}

function bulletLines(values: readonly string[]): string[] {
  return values.length === EMPTY_SIZE ? ['- None'] : values.map((value) => `- ${value}`);
}

// "Charter projection" es la versión LEGIBLE POR HUMANOS del catálogo de
// roles — mismo dato que role-projection-registry.ts proyecta a config de
// adapter (JSON para OpenCode), pero acá se renderiza a markdown
// (ROLE_CHARTER_PROJECTION_PATH) para que un humano pueda leer "qué puede y
// no puede hacer cada rol" sin consultar la DB directamente. roleCatalogSnapshot
// es la misma foto congelada (catalogVersion+digest) que respalda los
// receipts de proyección — ambas proyecciones (a config y a charter) parten
// del mismo snapshot, así que no pueden divergir entre sí sin que el digest
// también cambie.
function renderRole(snapshot: RoleCatalogSnapshot, role: RoleContract): string[] {
  const policy = snapshot.rolePolicies.find((item) => item.roleId === role.roleId);
  const required = snapshot.requiredRoles.some((item) => item.roleId === role.roleId);
  const outgoing = snapshot.roleHandoffs.filter((item) => item.sourceRoleId === role.roleId)
    .map((item) => `${item.targetRoleId} via ${item.artifactContractRef}`);
  const incoming = snapshot.roleHandoffs.filter((item) => item.targetRoleId === role.roleId)
    .map((item) => `${item.sourceRoleId} via ${item.artifactContractRef}`);
  return [
    `## ${role.roleId}`,
    '',
    `- Definition version: ${role.definitionVersion}`,
    `- Required: ${String(required)}`,
    `- Mission: ${role.mission}`,
    `- Context: ${role.contextItemId}@${role.contextItemVersion}`,
    `- Input contract: ${role.inputContractRef}`,
    `- Output contract: ${role.outputContractRef}`,
    `- Model capability floor: ${role.minimumModelCapability}`,
    `- Self-correction mode: ${policy?.selfCorrectionMode ?? SELF_CORRECTION_MODE.NONE}`,
    '',
    '### Exclusive judgments',
    ...bulletLines(roleValues(snapshot.roleResponsibilities, role.roleId, (item) => item.responsibilityId)),
    '',
    '### Capability requests',
    ...bulletLines(roleValues(snapshot.capabilityRequestClasses, role.roleId, (item) => item.capabilityClass)),
    '',
    '### Prohibited effects',
    ...bulletLines(roleValues(snapshot.roleProhibitions, role.roleId, (item) => item.operationId)),
    '',
    '### Self-correction scopes',
    ...bulletLines(roleValues(snapshot.selfCorrectionScopes, role.roleId, (item) => item.outputClass)),
    '',
    '### Stop conditions',
    ...bulletLines(roleValues(snapshot.stopConditions, role.roleId, (item) => item.conditionId)),
    '',
    '### Escalation classes',
    ...bulletLines(roleValues(snapshot.escalationClasses, role.roleId, (item) => item.classId)),
    '',
    '### Outgoing handoffs',
    ...bulletLines(outgoing),
    '',
    '### Incoming handoffs',
    ...bulletLines(incoming),
    '',
  ];
}

function renderCharters(snapshot: RoleCatalogSnapshot, version: number, catalogDigest: string): string {
  return [
    '<!-- GENERATED FROM THE ACTIVE ROLE CATALOG - DO NOT EDIT -->',
    `<!-- catalog-version: ${version} -->`,
    `<!-- catalog-digest: ${catalogDigest} -->`,
    '',
    '# Role Charters',
    '',
    ...snapshot.roleContracts.flatMap((role) => renderRole(snapshot, role)),
  ].join('\n');
}

export function compileRoleCharterProjection(store: Store, repoRoot: string): RoleProjectionCandidate {
  const active = requireActiveRoleCatalog(store);
  const snapshot = roleCatalogSnapshot(store);
  const targetPath = join(repoRoot, ...ROLE_CHARTER_PROJECTION_PATH);
  const content = renderCharters(snapshot, active.version, active.catalogDigest);
  const artifacts = [{ targetPath, content }];
  const artifactDescriptor = [{
    path: relative(repoRoot, targetPath).split(sep).join('/'),
    contentDigest: digest(content),
  }];
  return {
    adapterId: ROLE_CHARTER_PROJECTION_ADAPTER_ID,
    agentIds: snapshot.roleContracts.map((role) => role.roleId),
    artifacts,
    profileDigest: digest(snapshot.operatingProfile),
    artifactDigest: digest(artifactDescriptor),
  };
}

function artifactViolations(artifact: RoleProjectionArtifact | undefined): string[] {
  if (artifact === undefined || !existsSync(artifact.targetPath)) {
    return [ROLE_CHARTER_PROJECTION_ERROR.ARTIFACT_MISSING];
  }
  if (readFileSync(artifact.targetPath, TEXT_ENCODING.UTF8) !== artifact.content) {
    return [ROLE_CHARTER_PROJECTION_ERROR.ARTIFACT_DRIFT];
  }
  return [];
}

export function inspectRoleCharterProjection(
  store: Store,
  repoRoot: string,
): { readonly valid: boolean; readonly violations: readonly string[] } {
  const candidate = compileRoleCharterProjection(store, repoRoot);
  const violations = [
    ...artifactViolations(candidate.artifacts[0]),
    ...roleProjectionReceiptViolations(store, candidate),
  ].sort();
  return { valid: violations.length === EMPTY_SIZE, violations };
}
