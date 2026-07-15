import { checkCatalogClosure } from '../check/catalog-closure.js';
import type { Store } from '../db/store.types.js';
import {
  inspectEffectiveRoleProjections,
  inspectRoleProjections,
} from '../gateway/adapters/role-projection-registry.js';
import { listExecutionProfiles } from '../gateway/profiles.js';
import { checkRoleCatalog } from './catalog.js';
import type { RoleCatalogCheck } from './catalog.types.js';
import { checkActiveRoleCatalog } from './catalog-activation.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { inspectRoleCharterProjection } from './charter-projection.js';

export async function checkRoleSystem(store: Store, repoRoot: string): Promise<RoleCatalogCheck> {
  const profiles = listExecutionProfiles(store);
  const effectiveProjections = await inspectEffectiveRoleProjections(repoRoot, profiles);
  const catalog = checkRoleCatalog(store);
  const activation = checkActiveRoleCatalog(store);
  const persistedClosure = activation.valid
    ? checkCatalogClosure(store, inspectRoleProjections(store, repoRoot, profiles))
    : { valid: false, violations: [] };
  const charters = activation.valid
    ? inspectRoleCharterProjection(store, repoRoot)
    : { valid: false, violations: [] };
  const effectiveClosure = checkCatalogClosure(store, effectiveProjections);
  const violations = [...new Set([
    ...catalog.violations,
    ...activation.violations,
    ...persistedClosure.violations,
    ...charters.violations,
    ...effectiveClosure.violations,
  ])].sort();
  return { valid: violations.length === EMPTY_SIZE, violations };
}
