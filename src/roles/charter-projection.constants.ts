import { CONTENT_DIRECTORY_NAME } from '../platform.constants.js';

export const ROLE_CHARTER_PROJECTION_ADAPTER_ID = 'role-charters-v1';
export const ROLE_CHARTER_PROJECTION_PATH = [CONTENT_DIRECTORY_NAME, 'roles', 'generated-charters.md'] as const;

export const ROLE_CHARTER_PROJECTION_ERROR = {
  ARTIFACT_DRIFT: 'ROLE_CHARTER_ARTIFACT_DRIFT',
  ARTIFACT_MISSING: 'ROLE_CHARTER_ARTIFACT_MISSING',
} as const;
