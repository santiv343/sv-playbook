import { CONTENT_DIRECTORY_NAME } from '../platform.constants.js';

// El charter proyectado se escribe a content/roles/generated-charters.md —
// dentro de content/ (fuente markdown), no en un directorio de build,
// porque se trata como material de referencia legible junto al resto de
// content/, aunque esté generado.
export const ROLE_CHARTER_PROJECTION_ADAPTER_ID = 'role-charters-v1';
export const ROLE_CHARTER_PROJECTION_PATH = [CONTENT_DIRECTORY_NAME, 'roles', 'generated-charters.md'] as const;

export const ROLE_CHARTER_PROJECTION_ERROR = {
  ARTIFACT_DRIFT: 'ROLE_CHARTER_ARTIFACT_DRIFT',
  ARTIFACT_MISSING: 'ROLE_CHARTER_ARTIFACT_MISSING',
} as const;
