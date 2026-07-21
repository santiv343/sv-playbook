// Los 3 tipos de drift que roleProjectionReceiptViolations detecta: el
// CATÁLOGO cambió (versión/digest ya no matchea), el PERFIL de ejecución
// cambió, o el ARTEFACTO generado cambió — cada uno es una razón distinta
// para requerir re-promoción, no un genérico "drift".
export const ROLE_PROJECTION_RECEIPT_ID_PREFIX = 'role-projection:';

export const ROLE_PROJECTION_RECEIPT_ERROR = {
  MISSING: 'ROLE_PROJECTION_RECEIPT_MISSING',
  CATALOG_DRIFT: 'ROLE_PROJECTION_CATALOG_DRIFT',
  PROFILE_DRIFT: 'ROLE_PROJECTION_PROFILE_DRIFT',
  ARTIFACT_DRIFT: 'ROLE_PROJECTION_ARTIFACT_DRIFT',
} as const;
