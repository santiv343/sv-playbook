import { asc, eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { executionProfiles } from '../gateway/schema.constants.js';
import { requiredRoles } from '../roles/schema.constants.js';
import type { AdapterRoleProjection, CatalogClosureCheck } from './catalog-closure.types.js';

interface ProfileBinding {
  roleId: string;
  adapterId: string;
  agentId: string;
}

function enabledProfiles(store: Store): ProfileBinding[] {
  return store.orm.select({
    roleId: executionProfiles.roleId,
    adapterId: executionProfiles.adapterId,
    agentId: executionProfiles.agentId,
  }).from(executionProfiles).where(eq(executionProfiles.enabled, true))
    .orderBy(asc(executionProfiles.adapterId), asc(executionProfiles.agentId), asc(executionProfiles.roleId)).all();
}

function requiredRoleIds(store: Store): string[] {
  return store.orm.select({ roleId: requiredRoles.roleId }).from(requiredRoles)
    .orderBy(asc(requiredRoles.roleId)).all().map(({ roleId }) => roleId);
}

function roleProfileViolations(requiredRoles: readonly string[], profiles: readonly ProfileBinding[]): string[] {
  const violations: string[] = [];
  for (const roleId of requiredRoles) {
    if (!profiles.some((profile) => profile.roleId === roleId)) {
      violations.push(`${roleId}: no enabled execution profile`);
    }
  }
  for (const profile of profiles) {
    if (!requiredRoles.includes(profile.roleId)) {
      violations.push(`${profile.roleId}: enabled profile outside required role catalog`);
    }
  }
  return violations;
}

function adapterProjectionViolations(adapterId: string, expected: ReadonlySet<string>, actual: ReadonlySet<string>): string[] {
  const missing = [...expected].filter((agentId) => !actual.has(agentId))
    .map((agentId) => `${adapterId}: missing projected agent ${agentId}`);
  const unmanaged = [...actual].filter((agentId) => !expected.has(agentId))
    .map((agentId) => `${adapterId}: unmanaged projected agent ${agentId}`);
  return [...missing, ...unmanaged].sort();
}

function projectionViolations(profiles: readonly ProfileBinding[], projections: readonly AdapterRoleProjection[]): string[] {
  const projectionByAdapter = new Map(projections.map((projection) => [projection.adapterId, new Set(projection.agentIds)]));
  const adapters = new Set([...profiles.map((profile) => profile.adapterId), ...projections.map((projection) => projection.adapterId)]);
  const coverage = [...adapters].flatMap((adapterId) => adapterProjectionViolations(
    adapterId,
    new Set(profiles.filter((profile) => profile.adapterId === adapterId).map((profile) => profile.agentId)),
    projectionByAdapter.get(adapterId) ?? new Set<string>(),
  ));
  return [...projections.flatMap((projection) => projection.violations ?? []), ...coverage];
}

function duplicateBindingViolations(profiles: readonly ProfileBinding[]): string[] {
  const owners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const key = `${profile.adapterId}:${profile.agentId}`;
    const roles = owners.get(key) ?? new Set<string>();
    roles.add(profile.roleId);
    owners.set(key, roles);
  }
  return [...owners.entries()].filter(([, roles]) => roles.size > 1)
    .map(([key, roles]) => `${key}: projected agent bound to multiple roles ${[...roles].sort().join(', ')}`);
}

// "Cierre" del catálogo: tres axiomas que tienen que cumplirse a la vez
// para que el sistema de roles esté completo y sin ambigüedad — (1) todo
// rol REQUERIDO tiene al menos un perfil de ejecución habilitado (nadie
// puede despachar ese rol si no); (2) ningún agente de un adapter está
// atado a más de un rol a la vez (ambigüedad: ¿qué contexto le
// corresponde?); (3) lo que cada adapter proyecta realmente coincide con
// lo que los perfiles esperan — ni de menos (falta un agente) ni de más
// (agente proyectado sin rol que lo reclame).
export function checkCatalogClosure(store: Store, projections: readonly AdapterRoleProjection[]): CatalogClosureCheck {
  const requiredRoleCatalog = requiredRoleIds(store);
  const profiles = enabledProfiles(store);
  const violations = [
    ...roleProfileViolations(requiredRoleCatalog, profiles),
    ...duplicateBindingViolations(profiles),
    ...projectionViolations(profiles, projections),
  ].sort();
  return { valid: violations.length === 0, violations };
}
