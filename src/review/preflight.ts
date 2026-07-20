import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import type { Store } from '../db/store.types.js';
import { GH_ARGUMENT, GH_EXECUTABLE } from '../gh.constants.js';
import { GIT_ARGUMENT, GIT_EXECUTABLE, PROCESS_STDIO } from '../git.constants.js';
import { changedFilesForBase, resolveGitMergeBase } from '../git.js';
import { EMPTY_SIZE, TEXT_ENCODING } from '../platform.constants.js';
import { taskEvents } from '../tasks/schema.constants.js';
import { EVENT_EVIDENCE } from '../tasks/service.constants.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { overlaps } from '../tasks/write-set.js';
import {
  HEAD_SHA_STATUS,
  PREFLIGHT_CHECK_NAME,
  PREFLIGHT_EVENT_PREFIX,
  PREFLIGHT_STATUS,
  type CleanVerificationReceipt,
  type CleanVerificationPolicy,
  type PreflightCheck,
  type PreflightReport,
  type VerifyProcessResult,
} from './preflight.types.js';
import {
  PREFLIGHT_VERIFY_DETAIL,
  PREFLIGHT_VERIFY_EXIT_CODE,
} from './preflight.constants.js';
import { runCleanVerification } from './preflight-clean-verification.js';
import { executePreflightCommand } from './preflight-process.js';

const CHK_PASS = PREFLIGHT_STATUS.PASS;
const CHK_FAIL = PREFLIGHT_STATUS.FAIL;
const CHK_SKIP = PREFLIGHT_STATUS.SKIP;
const CHK_UNKNOWN = PREFLIGHT_STATUS.UNKNOWN;
const GITHUB_CHECK_FIELD = { ROLLUP: 'statusCheckRollup' } as const;
const GITHUB_CHECK_STATE = { SUCCESS: 'SUCCESS', NEUTRAL: 'neutral' } as const;

const RED_TEST_SECTION_RE = /^## RED test\s*\n(.*?)(?=\n## |$)/ms;

function findMergeBase(worktree: string, baseReference: string): string | undefined {
  try {
    return resolveGitMergeBase(worktree, baseReference);
  } catch {
    return undefined;
  }
}

function getChangedFiles(worktree: string, baseReference: string): string[] {
  try {
    return changedFilesForBase(worktree, baseReference);
  } catch {
    return [];
  }
}

function checkWriteSet(writeSet: readonly string[], changedFiles: string[]): { check: PreflightCheck; violations: string[] } {
  if (writeSet.length === 0) {
    return { check: { name: 'write-set', status: CHK_SKIP, detail: 'no write_set defined' }, violations: [] };
  }
  if (changedFiles.length === 0) {
    return { check: { name: 'write-set', status: CHK_SKIP, detail: 'no changed files to check' }, violations: [] };
  }
  const violations = changedFiles.filter((f) => !writeSet.some((g) => overlaps(g, f)));
  if (violations.length > 0) {
    return {
      check: { name: 'write-set', status: CHK_FAIL, detail: `files outside write_set: ${violations.join(', ')}` },
      violations,
    };
  }
  return { check: { name: 'write-set', status: CHK_PASS, detail: `all ${changedFiles.length} changed file(s) within write_set` }, violations: [] };
}

function checkHeadSha(worktree: string): string {
  try {
    return execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.HEAD], { cwd: worktree, encoding: TEXT_ENCODING.UTF8 }).trim();
  } catch {
    return '';
  }
}

const PR_SHA_TIMEOUT = 15_000;

function fetchPrHeadSha(worktree: string, pr: string | undefined): string | undefined {
  if (pr === undefined) return undefined;
  try {
    return execFileSync(GH_EXECUTABLE, ['pr', 'view', pr, '--json', 'headRefOid', GH_ARGUMENT.JQ, '.headRefOid'], {
      cwd: worktree, encoding: 'utf8', timeout: PR_SHA_TIMEOUT, stdio: 'pipe',
    }).trim();
  } catch {
    return 'unknown';
  }
}

const _hsm = (s: PreflightCheck['status'], d: string): PreflightCheck => ({ name: 'head-sha-match', status: s, detail: d });

function headShaMatchCheck(actualSha: string, prSha: string | undefined): PreflightCheck {
  if (prSha === undefined) return _hsm(CHK_SKIP, 'no PR SHA to compare');
  if (actualSha === '') return _hsm(CHK_UNKNOWN, 'could not read HEAD');
  if (actualSha === prSha) return _hsm(CHK_PASS, `HEAD ${actualSha.slice(0, 12)} matches reported SHA`);
  return _hsm(CHK_FAIL, `HEAD ${actualSha.slice(0, 12)} does not match reported ${prSha.slice(0, 12)}`);
}

function parseCiChecks(raw: unknown): PreflightCheck[] {
  if (raw === null || typeof raw !== 'object') {
    return [{ name: 'ci-checks', status: CHK_UNKNOWN, detail: 'could not parse CI status' }];
  }
  const entries = Object.entries(raw).find(([k]) => k === GITHUB_CHECK_FIELD.ROLLUP);
  if (entries === undefined || !Array.isArray(entries[1]) || entries[1].length === 0) {
    return [{ name: 'ci-checks', status: CHK_SKIP, detail: 'no CI checks found' }];
  }
  return entries[1].map((c: Record<string, unknown>) => {
    let ctx = 'unknown';
    if (typeof c.context === 'string') ctx = c.context;
    else if (typeof c.name === 'string') ctx = c.name;
    let state = 'unknown';
    if (typeof c.state === 'string') state = c.state;
    else if (typeof c.conclusion === 'string') state = c.conclusion;
    const ok = state === GITHUB_CHECK_STATE.SUCCESS || state === GITHUB_CHECK_STATE.NEUTRAL;
    return { name: `ci:${ctx}`, status: ok ? CHK_PASS : CHK_FAIL, detail: `${ctx}: ${state}` };
  });
}

function checkCiStatus(worktree: string, pr: string | undefined): PreflightCheck[] {
  if (pr === undefined) {
    return [{ name: 'ci-checks', status: CHK_SKIP, detail: 'no PR number provided' }];
  }
  try {
    execFileSync('gh', ['--version'], { encoding: 'utf8' });
    const raw: unknown = JSON.parse(
      execFileSync('gh', ['pr', 'view', pr, '--json', 'statusCheckRollup'], { cwd: worktree, encoding: 'utf8' }).trim(),
    );
    return parseCiChecks(raw);
  } catch {
    return [{ name: 'ci-checks', status: CHK_UNKNOWN, detail: 'gh unavailable or PR query failed' }];
  }
}

function checkBaseReference(baseReference: string, mergeBase: string | undefined): PreflightCheck {
  return mergeBase === undefined
    ? {
      name: PREFLIGHT_CHECK_NAME.BASE_REFERENCE,
      status: CHK_FAIL,
      detail: `configured base reference is unavailable: ${baseReference}`,
    }
    : {
      name: PREFLIGHT_CHECK_NAME.BASE_REFERENCE,
      status: CHK_PASS,
      detail: `configured base resolved to ${mergeBase}`,
    };
}

function verifyWorktreeClean(worktree: string): PreflightCheck | undefined {
  try {
    const status = execFileSync(
      GIT_EXECUTABLE,
      [GIT_ARGUMENT.STATUS, GIT_ARGUMENT.PORCELAIN],
      { cwd: worktree, encoding: TEXT_ENCODING.UTF8, stdio: PROCESS_STDIO.PIPE },
    ).trim();
    return status.length > EMPTY_SIZE
      ? { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_FAIL, detail: PREFLIGHT_VERIFY_DETAIL.DIRTY_WORKTREE }
      : undefined;
  } catch {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_UNKNOWN, detail: PREFLIGHT_VERIFY_DETAIL.STATUS_UNAVAILABLE };
  }
}

function verifyFailureDetail(command: string, result: VerifyProcessResult, noOutputTimeoutMs: number): string {
  if (result.timedOut) return `${command} produced no output for ${noOutputTimeoutMs} ms`;
  const summary = `${command} failed with exit code ${String(result.exitCode)}`;
  return result.outputTail.length > EMPTY_SIZE ? `${summary}\n${result.outputTail}` : summary;
}

export async function runSourceWorktreeVerifyCheck(worktree: string): Promise<PreflightCheck> {
  const cfgPath = join(worktree, PLAYBOOK_CONFIG_FILE_NAME);
  if (!existsSync(cfgPath)) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_SKIP, detail: 'no playbook.config.json' };
  }
  if (/enforceVerifyOnReview\s*:\s*false/.test(readFileSync(cfgPath, 'utf8'))) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_SKIP, detail: 'verify enforcement disabled in config' };
  }
  const config = loadConfig(worktree);
  if (config.verifyCommand.trim() === '') {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_SKIP, detail: 'no verifyCommand configured' };
  }

  const dirtyBeforeVerify = verifyWorktreeClean(worktree);
  if (dirtyBeforeVerify !== undefined) return dirtyBeforeVerify;

  const timeoutMs = config.reviewPreflight.noOutputTimeoutMs;
  const result = await executePreflightCommand(config.verifyCommand, worktree, timeoutMs);
  if (result.spawnFailed) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_UNKNOWN, detail: PREFLIGHT_VERIFY_DETAIL.SPAWN_FAILED };
  }
  if (result.timedOut || result.exitCode !== PREFLIGHT_VERIFY_EXIT_CODE.SUCCESS) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_FAIL, detail: verifyFailureDetail(config.verifyCommand, result, timeoutMs) };
  }
  return verifyWorktreeClean(worktree)
    ?? { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_PASS, detail: `${config.verifyCommand} succeeded` };
}

function readRedTestCriteria(body: string): string {
  const match = RED_TEST_SECTION_RE.exec(body);
  if (match === null || match[1] === undefined) return '';
  return match[1].trim();
}

// Sólo verifica que la sección "## RED test" EXISTE en el documento del
// packet — no evalúa si el test realmente falla antes de implementar
// (PRINCIPLE-002). Esa adecuación semántica es responsabilidad del
// reviewer humano/agente, no de este chequeo mecánico.
function checkRedTest(body: string): PreflightCheck {
  const criteria = readRedTestCriteria(body);
  if (criteria === '') {
    return { name: PREFLIGHT_CHECK_NAME.RED_TEST, status: CHK_SKIP, detail: 'no RED test section in packet document' };
  }
  return {
    name: PREFLIGHT_CHECK_NAME.RED_TEST,
    status: CHK_PASS,
    detail: 'RED criteria loaded from durable work definition; semantic adequacy requires review',
  };
}

const _db = (s: PreflightCheck['status'], d: string): PreflightCheck => ({ name: 'deviation-bullets', status: s, detail: d });

function checkDeviationBullets(): PreflightCheck {
  return _db(CHK_SKIP, 'no deviation check is configured');
}

function verificationCheck(receipt: CleanVerificationReceipt): PreflightCheck {
  const failure = receipt.phases.find((phase) => phase.status === PREFLIGHT_STATUS.FAIL
    || phase.status === PREFLIGHT_STATUS.UNKNOWN);
  if (failure === undefined) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_PASS, detail: 'clean verification passed' };
  }
  const output = failure.outputTail === '' ? '' : `: ${failure.outputTail}`;
  return {
    name: PREFLIGHT_CHECK_NAME.VERIFY,
    status: failure.status === PREFLIGHT_STATUS.UNKNOWN ? CHK_UNKNOWN : CHK_FAIL,
    detail: `${failure.phase}:${failure.failureCode ?? PREFLIGHT_STATUS.UNKNOWN}${output}`,
  };
}

function cleanVerificationPolicy(
  configurationRoot: string,
  config: ReturnType<typeof loadConfig>,
): CleanVerificationPolicy | undefined {
  if (!existsSync(join(configurationRoot, PLAYBOOK_CONFIG_FILE_NAME))) return undefined;
  return {
    verifyCommand: config.verifyCommand,
    preparationCommand: config.reviewPreflight.preparationCommand,
    noOutputTimeoutMs: config.reviewPreflight.noOutputTimeoutMs,
  };
}

function preflightHeadStatus(sha: string, prSha: string | undefined): PreflightReport['headShaMatch'] {
  if (prSha === undefined) return HEAD_SHA_STATUS.UNKNOWN;
  return sha === prSha ? HEAD_SHA_STATUS.MATCH : HEAD_SHA_STATUS.MISMATCH;
}

function persistPreflightEvent(store: Store, packetId: string, overall: PreflightReport['overall'], persist: boolean): void {
  if (!persist) return;
  store.orm.insert(taskEvents).values({
    sessionId: null,
    packetId,
    command: EVENT_EVIDENCE,
    detail: `${PREFLIGHT_EVENT_PREFIX}${overall}`,
    at: new Date().toISOString(),
  }).run();
}

// Chequeos mecánicos que corren ANTES de que un candidato llegue a
// revisión humana/de otro agente: write_set respetado, HEAD coincide con lo
// reportado en el PR, CI en verde, verify limpio en un checkout aislado
// (runCleanVerification), y presencia de la sección "RED test" en el
// documento del packet (sólo verifica que existe, no su calidad semántica —
// eso queda para el reviewer humano/agente). `overall` es FAIL si cualquier
// check individual fue FAIL; SKIP/UNKNOWN no bloquean por sí solos.
export async function runPreflight(
  store: Store,
  packetId: string,
  worktree: string,
  options?: { pr: string | undefined; persistEvent?: boolean },
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];

  const definition = loadWorkDefinition(store, packetId);
  const writeSet = definition.value.writeSet;
  const configurationRoot = store.repoRoot;
  const config = loadConfig(configurationRoot);
  const baseReference = config.reviewPreflight.baseReference;
  const mergeBase = findMergeBase(worktree, baseReference);
  const changedFiles = mergeBase !== undefined ? getChangedFiles(worktree, baseReference) : [];

  checks.push(checkBaseReference(baseReference, mergeBase));

  const ws = checkWriteSet(writeSet, changedFiles);
  checks.push(ws.check);

  const sha = checkHeadSha(worktree);
  const prSha = fetchPrHeadSha(worktree, options?.pr);
  checks.push(headShaMatchCheck(sha, prSha));

  const ciChecks = checkCiStatus(worktree, options?.pr);
  checks.push(...ciChecks);

  const cleanVerification = await runCleanVerification(
    worktree,
    {},
    cleanVerificationPolicy(configurationRoot, config),
    configurationRoot,
  );
  const verifyResult = verificationCheck(cleanVerification);
  checks.push(verifyResult);

  const redTestResult = checkRedTest(definition.value.body);
  checks.push(redTestResult);

  const stopChecks: PreflightCheck[] = [];

  const devResult = checkDeviationBullets();
  checks.push(devResult);

  const failed = checks.some((c) => c.status === CHK_FAIL);
  const overall = failed ? CHK_FAIL : CHK_PASS;

  persistPreflightEvent(store, packetId, overall, options?.persistEvent !== false);

  return {
    packetId,
    pr: options?.pr,
    headSha: sha,
    headShaMatch: preflightHeadStatus(sha, prSha),
    ciChecks,
    verifyResult,
    cleanVerification,
    writeSetViolations: ws.violations,
    redTestFound: redTestResult.status === CHK_PASS,
    stopConditions: stopChecks,
    deviationBullets: devResult.status === CHK_FAIL ? [devResult.detail] : [],
    checks,
    overall,
  };
}
