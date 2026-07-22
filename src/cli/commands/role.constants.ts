// Los 16 subcomandos reales de `role` (ver USAGE en role.ts) — cada uno
// mapea a una función de escritura/lectura de roles/catalog.ts o a un
// comando de mantenimiento (activate/bootstrap/project/receipt).
export const ROLE_SUBCOMMAND = {
  ACTIVATE: 'activate',
  BOOTSTRAP: 'bootstrap',
  CHECK: 'check',
  DEFINE: 'define',
  EVALUATE_MODELS: 'evaluate-models',
  ESCALATION: 'escalation',
  HANDOFF: 'handoff',
  LIST: 'list',
  MODEL_CAPABILITY: 'model-capability',
  MODEL_EVIDENCE: 'model-evidence',
  POLICY: 'policy',
  PROFILE: 'profile',
  PROJECT: 'project',
  RECEIPT: 'receipt',
  REQUIRE: 'require',
  RESPONSIBILITY: 'responsibility',
} as const;
