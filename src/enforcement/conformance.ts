import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Ajv } from 'ajv';
import type { Check, ConformanceReceipt } from './conformance.types.js';
import { CONFORMANCE_VERDICT, CONTRACT_FIELD, ENFORCEMENT_CLASSIFICATION, INDEX_NOT_FOUND, JSON_TOKEN } from './conformance.constants.js';
import { EMPTY_SIZE, HASH_ALGORITHM, HASH_ENCODING, SINGLE_SIZE, TEXT_ENCODING } from '../platform.constants.js';
import { JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';
import { PROPOSAL_FORBIDDEN_KEYWORDS } from '../contracts/protocol-work.constants.js';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';
import { VERIFICATION_STATUS } from '../verification/verification.constants.js';

const _require = createRequire(import.meta.url);
const AJV_PKG_RAW: unknown = _require('ajv/package.json');
const AJV_PACKAGE_META: Record<string, unknown> = isRecord(AJV_PKG_RAW) ? AJV_PKG_RAW : {};
const { version: AJV_PACKAGE_VERSION } = AJV_PACKAGE_META;
const AJV_VERSION = isString(AJV_PACKAGE_VERSION) ? AJV_PACKAGE_VERSION : '';

const AGENT_OWNER_PATTERN = /\b(llm|agent|ai)\b/i;

const FAILURE_CODES = {
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  DUPLICATE_CONTROL_IDS: 'DUPLICATE_CONTROL_IDS',
  DUPLICATE_SCENARIO_IDS: 'DUPLICATE_SCENARIO_IDS',
  ORPHANED_SCENARIOS: 'ORPHANED_SCENARIOS',
  DANGLING_REFERENCES: 'DANGLING_REFERENCES',
  INCOMPLETE_CONTROLS: 'INCOMPLETE_CONTROLS',
  AGENT_OWNER: 'AGENT_OWNER',
} as const;

const REQUIRED_ENFORCEMENT_FIELDS = [
  'enforcement_point',
  'deterministic_outcome',
  DATABASE_COLUMN.FAILURE_CODE,
  'evidence_receipt',
  CONTRACT_FIELD.TEST_IDS,
] as const;

// `enforce` valida una tripleta contract+schema+profile SIN tocar la DB —
// AGENT_OWNER_PATTERN es interesante: busca literalmente "llm"/"agent"/"ai"
// como dueño de un control, y lo marca como violación (FAILURE_CODES.AGENT_OWNER)
// — la mecanización de "un control de enforcement no puede estar a cargo de
// un agente/LLM", forzando que cada control tenga un owner humano o
// determinístico real, no "la IA se encarga".
class ConformanceError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'ConformanceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === JSON_SCHEMA_TYPE.OBJECT && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === JSON_SCHEMA_TYPE.STRING;
}

function readUtf8File(path: string): string {
  if (!existsSync(path)) {
    throw new ConformanceError(`File not found: ${path}`, path);
  }
  return readFileSync(path, TEXT_ENCODING.UTF8);
}

function parseJsonStrict(raw: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConformanceError(`Invalid JSON: ${path}`, path);
  }
  if (!isRecord(parsed)) {
    throw new ConformanceError(`Expected JSON object: ${path}`, path);
  }
  return parsed;
}

function canonicalJsonStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => {
    const v = obj[k];
    let vs: string;
    if (isRecord(v)) vs = canonicalJsonStringify(v);
    else if (Array.isArray(v)) vs = `[${v.map((item) => isRecord(item) ? canonicalJsonStringify(item) : JSON.stringify(item)).join(',')}]`;
    else vs = JSON.stringify(v);
    return `${JSON.stringify(k)}:${vs}`;
  });
  return `{${pairs.join(',')}}`;
}

function sha256Hex(content: string): string {
  return createHash(HASH_ALGORITHM.SHA256).update(content, TEXT_ENCODING.UTF8).digest(HASH_ENCODING.HEX);
}

function parseAndCanonicalize(raw: string): string {
  const parsed: unknown = JSON.parse(raw);
  if (isRecord(parsed)) {
    return canonicalJsonStringify(parsed);
  }
  return raw;
}

function extractScenarioIds(scenarios: unknown): string[] {
  if (!Array.isArray(scenarios)) return [];
  const ids: string[] = [];
  for (const item of scenarios) {
    if (!isString(item)) continue;
    const colonIdx = item.indexOf(JSON_TOKEN.COLON);
    if (colonIdx === INDEX_NOT_FOUND) continue;
    ids.push(item.slice(0, colonIdx).trim());
  }
  return ids;
}

function getStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return isString(v) ? v : undefined;
}

function getStringArray(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  const result: string[] = [];
  for (const item of v) {
    if (isString(item)) result.push(item);
  }
  return result;
}

function findJsonContainerStart(rawJson: string, containerKey: string): number {
  const esc = containerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"${esc}"\\s*:`).exec(rawJson);
  if (!match) return -1;
  let pos = match.index + match[0].length;
  while (pos < rawJson.length && rawJson[pos]?.trim() === '') pos++;
  return rawJson[pos] === JSON_TOKEN.OPEN_BRACE ? pos + 1 : -1;
}

function recordOneKey(key: string, seen: Set<string>, dups: Set<string>): void {
  if (seen.has(key)) dups.add(key);
  seen.add(key);
}

function scanOneJsonKey(json: string, quotePos: number, seen: Set<string>, dups: Set<string>): number {
  let p = quotePos + 1;
  while (p < json.length) {
    if (json[p] === JSON_TOKEN.BACKSLASH) { p += 2; continue; }
    if (json[p] === JSON_TOKEN.DOUBLE_QUOTE) break;
    p++;
  }
  if (p >= json.length) return quotePos + 1;
  const key = json.slice(quotePos + 1, p);
  p++;
  while (p < json.length && json[p]?.trim() === '') p++;
  if (json[p] === JSON_TOKEN.COLON) recordOneKey(key, seen, dups);
  return p;
}

function scanStep(ch: string, st: { pos: number; depth: number; inString: boolean; escaped: boolean }): void {
  if (st.escaped) { st.escaped = false; st.pos++; return; }
  if (ch === JSON_TOKEN.BACKSLASH && st.inString) { st.escaped = true; st.pos++; return; }
  if (ch === JSON_TOKEN.DOUBLE_QUOTE) { st.inString = !st.inString; st.pos++; return; }
  if (st.inString) { st.pos++; return; }
  if (ch === JSON_TOKEN.OPEN_BRACE) st.depth++;
  else if (ch === JSON_TOKEN.CLOSE_BRACE) st.depth--;
  st.pos++;
}

function scanJsonKeysAtDepth(rawJson: string, startPos: number): string[] {
  const st = { pos: startPos, depth: SINGLE_SIZE, inString: false, escaped: false };
  const seen = new Set<string>();
  const dups = new Set<string>();

  while (st.pos < rawJson.length && st.depth > EMPTY_SIZE) {
    if (!st.inString && st.depth === SINGLE_SIZE && rawJson[st.pos] === JSON_TOKEN.DOUBLE_QUOTE && !st.escaped) {
      st.pos = scanOneJsonKey(rawJson, st.pos, seen, dups);
      continue;
    }
    scanStep(rawJson[st.pos] ?? '', st);
  }
  return [...dups];
}

function findJsonKeyDuplicates(rawJson: string, containerKey: string): string[] {
  const bodyStart = findJsonContainerStart(rawJson, containerKey);
  if (bodyStart === INDEX_NOT_FOUND) return [];
  return scanJsonKeysAtDepth(rawJson, bodyStart);
}

function withoutSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!PROPOSAL_FORBIDDEN_KEYWORDS.has(key)) copy[key] = raw[key];
  }
  return copy;
}

function runSchemaCheck(schema: Record<string, unknown>, profile: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const ajv = new Ajv();
  const validate = ajv.compile(withoutSchema(schema));
  const valid = validate(profile);
  if (valid) return { valid: true, errors: [] };
  const errors: string[] = [];
  if (validate.errors) {
    for (const e of validate.errors) {
      errors.push(`${e.instancePath} ${e.message ?? ''}`);
    }
  }
  return { valid: false, errors };
}

function isFieldMissing(field: string, value: unknown): boolean {
  if (field === CONTRACT_FIELD.TEST_IDS) {
    return !Array.isArray(value) || value.length === EMPTY_SIZE;
  }
  return !isString(value) || value.length === EMPTY_SIZE;
}

function buildCheck(name: string, failed: boolean, failDetail: string, passDetail: string): Check {
  return { name, status: failed ? VERIFICATION_STATUS.FAIL : VERIFICATION_STATUS.PASS, detail: failed ? failDetail : passDetail };
}

function pushCheck(checks: Check[], codes: string[], name: string, ids: string[], failPrefix: string, code: string, passDetail: string): void {
  const failed = ids.length > EMPTY_SIZE;
  const detail = failed ? `${failPrefix}${ids.join(', ')}` : passDetail;
  checks.push(buildCheck(name, failed, detail, detail));
  if (failed) codes.push(code);
}

function runDuplicateControlsCheck(rawContract: string): string[] {
  return findJsonKeyDuplicates(rawContract, CONTRACT_FIELD.CONTROL_CATALOG);
}

function runDuplicateScenariosCheck(scenarioIds: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of scenarioIds) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
}

function runOrphanedScenariosCheck(
  validScenarioIds: Set<string>,
  allReferencedIds: Set<string>,
): string[] {
  const orphaned: string[] = [];
  for (const id of validScenarioIds) {
    if (!allReferencedIds.has(id)) orphaned.push(id);
  }
  return orphaned;
}

function runDanglingRefsCheck(
  controls: Array<{ id: string; testIds: string[] }>,
  validScenarioIds: Set<string>,
): string[] {
  const dangling: string[] = [];
  for (const ctrl of controls) {
    for (const tid of ctrl.testIds) {
      if (!validScenarioIds.has(tid)) {
        dangling.push(`${ctrl.id}.test_ids -> ${tid}`);
      }
    }
  }
  return dangling;
}

function runIncompleteControlsCheck(
  controls: Array<{ id: string; classification: string; control: Record<string, unknown> }>,
): string[] {
  const incomplete: string[] = [];
  for (const ctrl of controls) {
    const cls = ctrl.classification;
    if (cls !== ENFORCEMENT_CLASSIFICATION.RUNTIME && cls !== ENFORCEMENT_CLASSIFICATION.ADAPTER) continue;
    if (REQUIRED_ENFORCEMENT_FIELDS.some((f) => isFieldMissing(f, ctrl.control[f]))) {
      incomplete.push(ctrl.id);
    }
  }
  return incomplete;
}

function runAgentOwnerCheck(
  controls: Array<{ id: string; owner: string }>,
): string[] {
  const agents: string[] = [];
  for (const ctrl of controls) {
    if (AGENT_OWNER_PATTERN.test(ctrl.owner)) {
      agents.push(ctrl.id);
    }
  }
  return agents;
}

type CtrlInfo = { id: string; classification: string; owner: string; testIds: string[]; control: Record<string, unknown> };

function parseControls(controlCatalog: Record<string, unknown>): { controls: CtrlInfo[]; allReferencedIds: Set<string> } {
  const controlIds = Object.keys(controlCatalog);
  const controls: CtrlInfo[] = [];
  const allReferencedIds = new Set<string>();

  for (const id of controlIds) {
    const rawCtrl = controlCatalog[id];
    if (!isRecord(rawCtrl)) continue;
    const classification = getStringField(rawCtrl, DATABASE_COLUMN.CLASSIFICATION) ?? '';
    const owner = getStringField(rawCtrl, 'owner') ?? '';
    const testIds = getStringArray(rawCtrl, CONTRACT_FIELD.TEST_IDS);
    for (const tid of testIds) allReferencedIds.add(tid);
    controls.push({ id, classification, owner, testIds, control: rawCtrl });
  }

  return { controls, allReferencedIds };
}

function buildResultChecks(
  schemaResult: { valid: boolean; errors: string[] },
  duplicateControlIds: string[],
  duplicateScenarioIds: string[],
  orphanedScenarios: string[],
  danglingReferences: string[],
  incompleteControls: string[],
  agentOwnerControls: string[],
): { checks: Check[]; failureCodes: string[] } {
  const checks: Check[] = [];
  const codes: string[] = [];

  const schemaFailed = !schemaResult.valid;
  checks.push(buildCheck('schema-validation', schemaFailed, `Schema errors: ${schemaResult.errors.join('; ')}`, 'Profile matches schema'));
  if (schemaFailed) codes.push(FAILURE_CODES.SCHEMA_INVALID);

  pushCheck(checks, codes, 'duplicate-control-ids', duplicateControlIds, 'Duplicate control IDs: ', FAILURE_CODES.DUPLICATE_CONTROL_IDS, 'No duplicate control IDs');
  pushCheck(checks, codes, 'duplicate-scenario-ids', duplicateScenarioIds, 'Duplicate scenario IDs: ', FAILURE_CODES.DUPLICATE_SCENARIO_IDS, 'No duplicate scenario IDs');
  pushCheck(checks, codes, 'orphaned-scenarios', orphanedScenarios, 'Orphaned scenarios not referenced by any control: ', FAILURE_CODES.ORPHANED_SCENARIOS, 'All scenarios referenced by at least one control');
  pushCheck(checks, codes, 'dangling-references', danglingReferences, 'Dangling test_ids references: ', FAILURE_CODES.DANGLING_REFERENCES, 'All test_ids map to existing scenarios');
  pushCheck(checks, codes, 'incomplete-controls', incompleteControls, 'Controls missing required enforcement metadata: ', FAILURE_CODES.INCOMPLETE_CONTROLS, 'All runtime/adapter controls have required enforcement metadata');
  pushCheck(checks, codes, 'agent-owners', agentOwnerControls, 'Controls with agent/LLM enforcement owner: ', FAILURE_CODES.AGENT_OWNER, 'No agent/LLM enforcement owners');

  return { checks, failureCodes: codes };
}

// Verifica que un "profile" (config de una instancia) cumple su contrato:
// valida contra el JSON Schema declarado y corre 6 chequeos estructurales
// adicionales que un schema JSON no puede expresar (IDs duplicados,
// escenarios huérfanos, referencias colgantes, metadata de enforcement
// incompleta, dueños de control que son agentes en vez de mecanismos
// runtime). Cada input se hashea (sha256 sobre JSON canonicalizado) para que
// el receipt pruebe exactamente qué versión de contrato/schema/profile se
// evaluó.
export function runConformance(contractPath: string, schemaPath: string, profilePath: string): ConformanceReceipt {
  const contractRaw = readUtf8File(contractPath);
  const schemaRaw = readUtf8File(schemaPath);
  const profileRaw = readUtf8File(profilePath);
  const contractDigest = sha256Hex(parseAndCanonicalize(contractRaw));
  const schemaDigest = sha256Hex(parseAndCanonicalize(schemaRaw));
  const profileDigest = sha256Hex(parseAndCanonicalize(profileRaw));
  const contract = parseJsonStrict(contractRaw, contractPath);
  const schema = parseJsonStrict(schemaRaw, schemaPath);
  const profile = parseJsonStrict(profileRaw, profilePath);
  const contractVersion = getStringField(contract, 'contract_version') ?? '';
  const controlCatalogRaw: unknown = contract[CONTRACT_FIELD.CONTROL_CATALOG];
  const controlCatalog: Record<string, unknown> = isRecord(controlCatalogRaw) ? controlCatalogRaw : {};
  const rawScenarios = contract['acceptance_scenarios'];
  const scenarioIds = extractScenarioIds(Array.isArray(rawScenarios) ? rawScenarios : []);
  const parsedControls = parseControls(controlCatalog);
  const validScenarioIdSet = new Set(scenarioIds);
  const schemaResult = runSchemaCheck(schema, profile);
  const duplicateControlIds = runDuplicateControlsCheck(contractRaw);
  const duplicateScenarioIds = runDuplicateScenariosCheck(scenarioIds);
  const orphanedScenarios = runOrphanedScenariosCheck(validScenarioIdSet, parsedControls.allReferencedIds);
  const danglingReferences = runDanglingRefsCheck(parsedControls.controls, validScenarioIdSet);
  const incompleteControls = runIncompleteControlsCheck(parsedControls.controls);
  const agentOwnerControls = runAgentOwnerCheck(parsedControls.controls.map((c) => ({ id: c.id, owner: c.owner })));
  const result = buildResultChecks(schemaResult, duplicateControlIds, duplicateScenarioIds, orphanedScenarios, danglingReferences, incompleteControls, agentOwnerControls);
  const verdict = result.checks.some((c) => c.status === VERIFICATION_STATUS.FAIL) ? CONFORMANCE_VERDICT.NONCONFORMANT : CONFORMANCE_VERDICT.CONFORMANT;
  return {
    contract_path: contractPath, schema_path: schemaPath, profile_path: profilePath,
    contract_digest: contractDigest, schema_digest: schemaDigest, profile_digest: profileDigest,
    validator_version: AJV_VERSION, ruleset_version: contractVersion,
    schema_valid: schemaResult.valid, schema_errors: schemaResult.errors,
    control_count: Object.keys(controlCatalog).length, scenario_count: scenarioIds.length,
    duplicate_control_ids: duplicateControlIds, duplicate_scenario_ids: duplicateScenarioIds,
    orphaned_scenarios: orphanedScenarios, dangling_references: danglingReferences,
    incomplete_controls: incompleteControls, agent_owner_controls: agentOwnerControls,
    checks: result.checks, verdict, failure_codes: result.failureCodes,
  };
}
