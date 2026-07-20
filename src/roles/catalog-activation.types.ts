// Lo que activateRoleCatalog devuelve al marcar una versión de
// role_catalog_versions como la vigente — usa ROLE_CATALOG_ACTIVATION_KEY
// (catalog-activation.constants.ts) fijo ('active') como PK, así que sólo
// puede existir UNA activación por store, nunca varias compitiendo.
export interface RoleCatalogActivationReceipt {
  readonly version: number;
  readonly catalogDigest: string;
  readonly activatedAt: string;
}
