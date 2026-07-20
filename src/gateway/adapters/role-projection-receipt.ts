import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Store } from '../../db/store.types.js';
import { requireActiveRoleCatalog } from '../../roles/catalog-activation.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../schema.constants.js';
import {
  ROLE_PROJECTION_RECEIPT_ERROR,
  ROLE_PROJECTION_RECEIPT_ID_PREFIX,
} from './role-projection-receipt.constants.js';
import type { RoleProjectionReceipt } from './role-projection-receipt.types.js';
import type { RoleProjectionCandidate } from './role-projection.types.js';

// Un receipt es la prueba de que un catálogo de roles concreto (catalogVersion
// + catalogDigest) se proyectó a la config de un adapter específico
// (profileDigest + artifactDigest de los archivos generados). Es idempotente
// por CONTENIDO — si ya existe un receipt con exactamente esos 5 valores, se
// reutiliza en vez de crear uno nuevo; sólo se reactiva (roleProjectionActivation,
// que sí es 1 fila por adapter, se pisa) para marcar cuál receipt es el
// "vigente" ahora mismo.
export function recordRoleProjectionReceipts(
  store: Store,
  candidates: readonly RoleProjectionCandidate[],
): readonly RoleProjectionReceipt[] {
  const catalog = requireActiveRoleCatalog(store);
  const createdAt = new Date().toISOString();
  const receipts: RoleProjectionReceipt[] = [];
  store.orm.transaction((transaction) => {
    for (const candidate of candidates) {
      const existing = transaction.select().from(roleProjectionReceipts).where(and(
        eq(roleProjectionReceipts.adapterId, candidate.adapterId),
        eq(roleProjectionReceipts.catalogVersion, catalog.version),
        eq(roleProjectionReceipts.catalogDigest, catalog.catalogDigest),
        eq(roleProjectionReceipts.profileDigest, candidate.profileDigest),
        eq(roleProjectionReceipts.artifactDigest, candidate.artifactDigest),
      )).get();
      const receipt: RoleProjectionReceipt = existing ?? {
        id: `${ROLE_PROJECTION_RECEIPT_ID_PREFIX}${uuidv7()}`,
        adapterId: candidate.adapterId,
        catalogVersion: catalog.version,
        catalogDigest: catalog.catalogDigest,
        profileDigest: candidate.profileDigest,
        artifactDigest: candidate.artifactDigest,
        createdAt,
      };
      if (existing === undefined) transaction.insert(roleProjectionReceipts).values(receipt).run();
      transaction.insert(roleProjectionActivation).values({
        adapterId: receipt.adapterId,
        receiptId: receipt.id,
        activatedAt: createdAt,
      }).onConflictDoUpdate({
        target: roleProjectionActivation.adapterId,
        set: { receiptId: receipt.id, activatedAt: createdAt },
      }).run();
      receipts.push(receipt);
    }
  });
  return receipts;
}

export function roleProjectionReceiptViolations(
  store: Store,
  candidate: RoleProjectionCandidate,
): readonly string[] {
  const catalog = requireActiveRoleCatalog(store);
  const receipt = store.orm.select({
    catalogVersion: roleProjectionReceipts.catalogVersion,
    catalogDigest: roleProjectionReceipts.catalogDigest,
    profileDigest: roleProjectionReceipts.profileDigest,
    artifactDigest: roleProjectionReceipts.artifactDigest,
  }).from(roleProjectionActivation)
    .innerJoin(roleProjectionReceipts, eq(roleProjectionReceipts.id, roleProjectionActivation.receiptId))
    .where(eq(roleProjectionActivation.adapterId, candidate.adapterId)).get();
  if (receipt === undefined) {
    return [`${ROLE_PROJECTION_RECEIPT_ERROR.MISSING}: ${candidate.adapterId}`];
  }
  const prefix = candidate.adapterId;
  return [
    ...(receipt.catalogVersion === catalog.version && receipt.catalogDigest === catalog.catalogDigest
      ? [] : [`${ROLE_PROJECTION_RECEIPT_ERROR.CATALOG_DRIFT}: ${prefix}`]),
    ...(receipt.profileDigest === candidate.profileDigest
      ? [] : [`${ROLE_PROJECTION_RECEIPT_ERROR.PROFILE_DRIFT}: ${prefix}`]),
    ...(receipt.artifactDigest === candidate.artifactDigest
      ? [] : [`${ROLE_PROJECTION_RECEIPT_ERROR.ARTIFACT_DRIFT}: ${prefix}`]),
  ];
}
