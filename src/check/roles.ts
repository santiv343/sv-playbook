import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { FILE_EXTENSION } from '../platform.constants.js';
import { ROLE_TABLE_DELIMITER, ROLE_TABLE_STATE } from './roles.constants.js';

const ROLE_STEP_TYPE = { EXEC: 'EXEC', JUDGMENT: 'JUDGMENT' } as const;
const MISSING_HANDOFF_MARKER = { EM_DASH: '\u2014', HYPHEN: '-' } as const;
const ROLE_FORMAT_FILE = 'format.md';

interface RoleViolation {
  file: string;
  message: string;
}

interface StepData {
  type: string;
  onMismatch: string;
}

const H_HANDOFFS = 'Handoffs';
const H_RESPONSIBILITY = 'Responsibility';
const H_STEPS = 'Steps';
const H_OUTPUT = 'Output';
const H_GATES = 'Gates';
const H_MISSION = 'Mission';
const H_READ_FIRST = 'Read first';
const H_INPUTS = 'Inputs';
const H_PROHIBITIONS = 'Prohibitions';
const H_DECISION = 'Decision';
const H_DECISION_AUTH = 'decision-authority';
const H_STOP = 'Stop conditions';

function isSeparatorRow(t: string): boolean {
  return /^\|[\s:|-]+$/.test(t);
}

function pushTableStep(t: string, steps: StepData[]): void {
  const cells = t.split(ROLE_TABLE_DELIMITER).map(c => c.trim()).filter(c => c !== '');
  steps.push({
    type: cells[1] ?? '',
    onMismatch: cells[4] ?? '',
  });
}

// Un parser de máquina de estados chico para tablas markdown (OUT -> HEAD ->
// BODY): sólo le interesa la fila de encabezado (para saltarla vía
// isSeparatorRow) y las filas de cuerpo de la sección "Steps" de cada
// archivo de rol — extrae type/onMismatch de columnas fijas por posición
// (cells[1], cells[4]) en vez de por nombre de columna, así que el formato
// de la tabla en format.md es un contrato implícito que este parser asume.
function findTables(content: string): StepData[] {
  const steps: StepData[] = [];
  const lines = content.split('\n');
  let state: typeof ROLE_TABLE_STATE[keyof typeof ROLE_TABLE_STATE] = ROLE_TABLE_STATE.OUT;

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith(ROLE_TABLE_DELIMITER)) { state = ROLE_TABLE_STATE.OUT; continue; }
    switch (state) {
      case ROLE_TABLE_STATE.OUT: state = ROLE_TABLE_STATE.HEAD; break;
      case ROLE_TABLE_STATE.HEAD: if (isSeparatorRow(t)) state = ROLE_TABLE_STATE.BODY; break;
      case ROLE_TABLE_STATE.BODY: pushTableStep(t, steps); break;
    }
  }
  return steps;
}

function getSection(content: string, heading: string): string {
  const re = new RegExp(`## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const m = content.match(re);
  return m ? (m[1] ?? '').trim() : '';
}

function hasSection(content: string, heading: string): boolean {
  return new RegExp(`## ${heading}`, 'i').test(content);
}

function hasMission(content: string): boolean {
  return hasSection(content, H_MISSION) || /^Mission:/im.test(content);
}

function hasProhibitionContent(content: string): boolean {
  return hasSection(content, H_PROHIBITIONS) || /never\s+\w/i.test(content);
}

function hasCapabilityText(content: string): boolean {
  return /Minimum capability/i.test(content);
}

function parseResponsibilities(content: string): string[] {
  const sec = getSection(content, H_RESPONSIBILITY);
  if (!sec) return [];
  return sec.split('\n')
    .map(l => l.replace(/^[\s]*[-*+]|\d+\.\s*/, '').trim().toLowerCase())
    .filter(r => r.length > 0 && r !== '');
}

function hasValidHandoff(content: string, known: Set<string>): boolean {
  const sec = getSection(content, H_HANDOFFS);
  if (!sec) return true;
  return [...known].some(r => sec.toLowerCase().includes(r));
}

function checkStepTypes(steps: StepData[], file: string, out: RoleViolation[]): void {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s) continue;
    const t = s.type.toUpperCase();
    const loc = `Table row ${i + 1} type="${s.type}"`;
    if (t !== ROLE_STEP_TYPE.EXEC && t !== ROLE_STEP_TYPE.JUDGMENT) {
      out.push({ file, message: `${loc}: not EXEC or JUDGMENT` });
    }
    if (t === ROLE_STEP_TYPE.JUDGMENT
      && (s.onMismatch === MISSING_HANDOFF_MARKER.EM_DASH || s.onMismatch === MISSING_HANDOFF_MARKER.HYPHEN || s.onMismatch.trim() === '')) {
      out.push({ file, message: `${loc}: JUDGMENT without escalation path` });
    }
  }
}

function checkSections(content: string, file: string, out: RoleViolation[]): void {
  const pairs: Array<[boolean, string]> = [
    [hasMission(content), 'mission'],
    [hasProhibitionContent(content), 'scope/prohibitions'],
    [hasSection(content, H_READ_FIRST) || hasSection(content, H_INPUTS), 'inputs/Read first'],
    [hasSection(content, H_STEPS), 'procedure (Steps)'],
    [hasSection(content, H_OUTPUT), 'outputs'],
    [hasSection(content, H_HANDOFFS), 'handoffs'],
  ];
  for (const [ok, name] of pairs) {
    if (!ok) out.push({ file, message: `Missing section: ${name}` });
  }
  const sec2: Array<[boolean, string]> = [
    [hasSection(content, H_GATES), 'gates'],
    [hasSection(content, H_DECISION) || hasSection(content, H_DECISION_AUTH), H_DECISION_AUTH],
    [hasSection(content, H_STOP) || hasSection(content, H_PROHIBITIONS), 'stop-conditions'],
    [hasCapabilityText(content), 'capability-floor'],
    [hasSection(content, H_RESPONSIBILITY), 'responsibility'],
  ];
  for (const [ok, name] of sec2) {
    if (!ok) out.push({ file, message: `Missing section: ${name}` });
  }
}

function checkCrossRoleOwnership(respMap: Map<string, string[]>, out: RoleViolation[]): void {
  for (const [r, owners] of respMap) {
    if (owners.length > 1) {
      out.push({ file: '(cross-role)', message: `Conflict: "${r}" owned by ${owners.join(', ')}` });
    }
  }
}

async function checkOneRole(
  file: string,
  fp: string,
  known: Set<string>,
  respMap: Map<string, string[]>,
): Promise<RoleViolation[]> {
  const out: RoleViolation[] = [];
  let text: string;
  try {
    text = await readFile(fp, 'utf-8');
  } catch {
    out.push({ file, message: 'Cannot read file' });
    return out;
  }

  checkSections(text, file, out);
  checkStepTypes(findTables(text), file, out);

  if (!hasValidHandoff(text, known)) {
    out.push({ file, message: 'Handoff references no known role' });
  }

  for (const r of parseResponsibilities(text)) {
    const owners = respMap.get(r) ?? [];
    owners.push(file);
    respMap.set(r, owners);
  }

  return out;
}

export async function checkRoles(rolesDir: string): Promise<RoleViolation[]> {
  const all: RoleViolation[] = [];
  let entries: string[];
  try {
    entries = await readdir(rolesDir);
  } catch {
    all.push({ file: '(roles dir)', message: `Cannot read: ${rolesDir}` });
    return all;
  }

  const roleFiles = entries.filter(e => e.endsWith(FILE_EXTENSION.MARKDOWN) && e !== ROLE_FORMAT_FILE);
  const known = new Set(roleFiles.map(f => basename(f, FILE_EXTENSION.MARKDOWN).toLowerCase()));
  const respMap = new Map<string, string[]>();

  for (const file of roleFiles) {
    const fp = join(rolesDir, file);
    const v = await checkOneRole(file, fp, known, respMap);
    for (const item of v) all.push(item);
  }

  checkCrossRoleOwnership(respMap, all);

  return all;
}
