import { checkCatalogClosure } from '../check/catalog-closure.js';
import type { Store } from '../db/store.types.js';
import {
  inspectEffectiveRoleProjections,
  inspectRoleProjections,
} from '../gateway/adapters/role-projection-registry.js';
import { executionProfiles } from '../gateway/schema.constants.js';
import { listExecutionProfiles } from '../gateway/profiles.js';
import { checkRoleCatalog } from './catalog.js';
import type { RoleCatalogCheck } from './catalog.types.js';
import { checkActiveRoleCatalog } from './catalog-activation.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { inspectRoleCharterProjection } from './charter-projection.js';
import { bootstrapBundledRoleCatalog, roleCatalogStoreIsVirgin } from './bundled-profile-bootstrap.js';

export async function checkRoleSystem(store: Store, repoRoot: string): Promise<RoleCatalogCheck> {
  const virgin = roleCatalogStoreIsVirgin(store);
  if (virgin) bootstrapBundledRoleCatalog(store);
  const catalog = checkRoleCatalog(store);
  const activation = checkActiveRoleCatalog(store);
  if (virgin) {
    const seededViolations = [...new Set([...catalog.violations, ...activation.violations])].sort();
    return { valid: seededViolations.length === EMPTY_SIZE, violations: seededViolations };
  }
  const profiles = listExecutionProfiles(store);
  const effectiveProjections = await inspectEffectiveRoleProjections(repoRoot, profiles);
  const profileCount = store.orm.select().from(executionProfiles).all().length;
  const persistedClosure = activation.valid && profileCount > EMPTY_SIZE
    ? checkCatalogClosure(store, inspectRoleProjections(store, repoRoot, profiles))
    : { valid: false, violations: [] } as const;
  const effectiveClosure = profileCount > EMPTY_SIZE
    ? checkCatalogClosure(store, effectiveProjections)
    : { valid: false, violations: [] } as const;
  const charters = inspectRoleCharterProjection(store, repoRoot);
  const violations = [...new Set([
    ...catalog.violations,
    ...activation.violations,
    ...persistedClosure.violations,
    ...charters.violations,
    ...effectiveClosure.violations,
  ])].sort();
  return { valid: violations.length === EMPTY_SIZE, violations };
}
