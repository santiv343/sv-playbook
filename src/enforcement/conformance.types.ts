// ConformanceReceipt es deliberadamente EXHAUSTIVO — cada campo es
// evidencia LITERAL de una verificación puntual (duplicate_control_ids,
// dangling_references, agent_owner_controls, etc.), no un resumen. Es la
// mecanización de PRINCIPLE-001 (todo claim de un agente respaldado por
// output literal de comando) aplicada al propio formato de salida de
// `enforce` — el receipt completo es la prueba, no sólo el `verdict` final.
export interface Check {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface ConformanceReceipt {
  contract_path: string;
  schema_path: string;
  profile_path: string;
  contract_digest: string;
  schema_digest: string;
  profile_digest: string;
  validator_version: string;
  ruleset_version: string;
  schema_valid: boolean;
  schema_errors: string[];
  control_count: number;
  scenario_count: number;
  duplicate_control_ids: string[];
  duplicate_scenario_ids: string[];
  orphaned_scenarios: string[];
  dangling_references: string[];
  incomplete_controls: string[];
  agent_owner_controls: string[];
  checks: Check[];
  verdict: 'conformant' | 'nonconformant';
  failure_codes: string[];
}
