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
import { bootstrapBundledRoleCatalog, roleCatalogStoreIsVirgin } from './bundled-profile-bootstrap.js';

export async function checkRoleSystem(store: Store, repoRoot: string): Promise<RoleCatalogCheck> {
  // A virgin store materializes the bundled catalog floor (committed defaults)
  // so fresh clones and CI validate real content instead of failing on absence.
  const virgin = roleCatalogStoreIsVirgin(store);
  if (virgin) bootstrapBundledRoleCatalog(store);
  const catalog = checkRoleCatalog(store);
  const activation = checkActiveRoleCatalog(store);
  // Environment-bound surfaces (enabled execution profiles, projection
  // receipts, the rendered charter artifact) only exist after an operator sets
  // up the environment; a freshly bootstrapped store validates the catalog
  // content and its activation.
  if (virgin) {
    const seededViolations = [...new Set([...catalog.violations, ...activation.violations])].sort();
    return { valid: seededViolations.length === EMPTY_SIZE, violations: seededViolations };
  }
  const profiles = listExecutionProfiles(store);
  const effectiveProjections = await inspectEffectiveRoleProjections(repoRoot, profiles);
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
