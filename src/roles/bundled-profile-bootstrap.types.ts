import type { BUNDLED_ROLE_BOOTSTRAP_MODE } from './bundled-profile.constants.js';

export type BundledRoleBootstrapMode =
  typeof BUNDLED_ROLE_BOOTSTRAP_MODE[keyof typeof BUNDLED_ROLE_BOOTSTRAP_MODE];

// EMPTY/RECONCILE/RESUME (BUNDLED_ROLE_BOOTSTRAP_MODE) son los 3 caminos
// que bootstrapBundledRoleCatalog puede tomar según el estado del store —
// virgen (EMPTY), catálogo custom existente que necesita reconciliarse
// contra el bundle (RECONCILE), o ya bootstrapeado antes (RESUME, no-op).
// El receipt es la prueba de CUÁL bootstrap ocurrió y contra qué versión.
export interface BundledRoleBootstrapReceipt {
  readonly profileId: string;
  readonly profileDigest: string;
  readonly catalogVersion: number;
  readonly catalogDigest: string;
  readonly createdAt: string;
}
