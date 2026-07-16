export const JSON_TOKEN = {
  COLON: ':',
  OPEN_BRACE: '{',
  CLOSE_BRACE: '}',
  BACKSLASH: '\\',
  DOUBLE_QUOTE: '"',
} as const;

export const CONTRACT_FIELD = {
  CONTROL_CATALOG: 'control_catalog',
  TEST_IDS: 'test_ids',
} as const;

export const ENFORCEMENT_CLASSIFICATION = {
  RUNTIME: 'runtime_enforced',
  ADAPTER: 'adapter_enforced',
} as const;

export const CONFORMANCE_VERDICT = {
  CONFORMANT: 'conformant',
  NONCONFORMANT: 'nonconformant',
} as const;

export const INDEX_NOT_FOUND = -1;
