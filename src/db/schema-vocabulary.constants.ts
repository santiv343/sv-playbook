export const DATABASE_COLUMN = {
  ACTIVATED_AT: 'activated_at',
  ADAPTER_ID: 'adapter_id',
  ASSESSED_AT: 'assessed_at',
  CAPABILITY_ID: 'capability_id',
  CATALOG_DIGEST: 'catalog_digest',
  CATALOG_VERSION: 'catalog_version',
  CLASSIFICATION: 'classification',
  CREATED_AT: 'created_at',
  DESCRIPTION: 'description',
  EXPIRES_AT: 'expires_at',
  FAILURE_CODE: 'failure_code',
  ID: 'id',
  KIND: 'kind',
  MESSAGE_ID: 'message_id',
  MODEL_ID: 'model_id',
  PROFILE_DIGEST: 'profile_digest',
  PROFILE_ID: 'profile_id',
  PROVIDER_ID: 'provider_id',
  RANK: 'rank',
  RECEIPT_JSON: 'receipt_json',
  RESPONSIBILITY_ID: 'responsibility_id',
  ROLE_ID: 'role_id',
  SESSION_ID: 'session_id',
  USER_VERSION: 'user_version',
  VARIANT: 'variant',
} as const;

export const SQLITE_INTEGER_MODE = {
  BOOLEAN: 'boolean',
} as const;

export const SQLITE_COLUMN_TYPE = {
  TEXT: 'TEXT',
} as const;
