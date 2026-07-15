import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import { stringColumn } from '../db/rows.js';
import type { Store } from '../db/store.types.js';
import { overlaps } from '../tasks/write-set.js';
import { EVENT_EVIDENCE, INSERT_EVENT_SQL } from '../tasks/service.constants.js';
import {
  PREFLIGHT_CHECK_NAME,
  PREFLIGHT_EVENT_PREFIX,
  PREFLIGHT_STATUS,
  type PreflightCheck,
  type PreflightReport,
  type VerifyProcessResult,
} from './preflight.types.js';
import { GIT_ARGUMENT, GIT_BASE_REFERENCE, GIT_EXECUTABLE, PROCESS_STDIO } from '../git.constants.js';
import { EMPTY_SIZE, PROCESS_EVENT, TEXT_ENCODING } from '../platform.constants.js';
import {
  PREFLIGHT_VERIFY_DETAIL,
  PREFLIGHT_VERIFY_EXIT_CODE,
  PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS,
  PREFLIGHT_VERIFY_TIMEOUT_MS,
} from './preflight.constants.js';

const CHK_PASS = PREFLIGHT_STATUS.PASS;
const CHK_FAIL = PREFLIGHT_STATUS.FAIL;
const CHK_SKIP = PREFLIGHT_STATUS.SKIP;
const CHK_UNKNOWN = PREFLIGHT_STATUS.UNKNOWN;
const GITHUB_CHECK_FIELD = { ROLLUP: 'statusCheckRollup' } as const;
const GITHUB_CHECK_STATE = { SUCCESS: 'SUCCESS', NEUTRAL: 'neutral' } as const;

const RED_TEST_SECTION_RE = /^## RED test\s*\n(.*?)(?=\n## |$)/ms;

function findMergeBase(worktree: string): string | undefined {
  for (const base of GIT_BASE_REFERENCE) {
    try {
      return execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.MERGE_BASE, base, GIT_ARGUMENT.HEAD], { cwd: worktree, encoding: TEXT_ENCODING.UTF8, stdio: 'pipe' }).trim();
    } catch { /* next */ }
  }
  return undefined;
}

function getChangedFiles(worktree: string, mergeBase: string): string[] {
  try {
    const out = execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.DIFF, GIT_ARGUMENT.NAME_ONLY, `${mergeBase}...HEAD`], { cwd: worktree, encoding: TEXT_ENCODING.UTF8 }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function checkWriteSet(writeSet: string[], changedFiles: string[]): { check: PreflightCheck; violations: string[] } {
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
    return execFileSync('gh', ['pr', 'view', pr, '--json', 'headRefOid', '--jq', '.headRefOid'], {
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

function outputTail(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-PREFLIGHT_VERIFY_OUTPUT_TAIL_CHARACTERS);
}

function executeVerifyCommand(command: string, worktree: string): Promise<VerifyProcessResult> {
  return new Promise((resolve) => {
    let tail = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(command, {
      cwd: worktree,
      shell: true,
      stdio: [PROCESS_STDIO.IGNORE, PROCESS_STDIO.PIPE, PROCESS_STDIO.PIPE],
      windowsHide: true,
    });
    child.stdout.setEncoding(TEXT_ENCODING.UTF8);
    child.stderr.setEncoding(TEXT_ENCODING.UTF8);
    child.stdout.on(PROCESS_EVENT.DATA, (chunk: string) => { tail = outputTail(tail, chunk); });
    child.stderr.on(PROCESS_EVENT.DATA, (chunk: string) => { tail = outputTail(tail, chunk); });
    const finish = (result: VerifyProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, PREFLIGHT_VERIFY_TIMEOUT_MS);
    child.once(PROCESS_EVENT.ERROR, () => {
      finish({ exitCode: null, outputTail: tail, spawnFailed: true, timedOut: false });
    });
    child.once(PROCESS_EVENT.CLOSE, (exitCode) => {
      finish({ exitCode, outputTail: tail.trim(), spawnFailed: false, timedOut });
    });
  });
}

function verifyFailureDetail(command: string, result: VerifyProcessResult): string {
  if (result.timedOut) return `${command} timed out after ${PREFLIGHT_VERIFY_TIMEOUT_MS} ms`;
  const summary = `${command} failed with exit code ${String(result.exitCode)}`;
  return result.outputTail.length > EMPTY_SIZE ? `${summary}\n${result.outputTail}` : summary;
}

export async function runVerifyCheck(worktree: string): Promise<PreflightCheck> {
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

  const result = await executeVerifyCommand(config.verifyCommand, worktree);
  if (result.spawnFailed) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_UNKNOWN, detail: PREFLIGHT_VERIFY_DETAIL.SPAWN_FAILED };
  }
  if (result.timedOut || result.exitCode !== PREFLIGHT_VERIFY_EXIT_CODE.SUCCESS) {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_FAIL, detail: verifyFailureDetail(config.verifyCommand, result) };
  }
  return verifyWorktreeClean(worktree)
    ?? { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_PASS, detail: `${config.verifyCommand} succeeded` };
}

function readRedTestName(docRoot: string, packetId: string): string {
  const p = join(docRoot, 'docs', 'packets', `${packetId}.md`);
  if (!existsSync(p)) return '';
  try {
    const text = readFileSync(p, 'utf8');
    const m = RED_TEST_SECTION_RE.exec(text);
    if (m === null || m[1] === undefined) return '';
    const firstLine = m[1].trim().split('\n')[0];
    return firstLine ?? '';
  } catch {
    return '';
  }
}

function checkRedTest(worktree: string, mergeBase: string | undefined, writeSet: string[], docRoot: string, packetId: string, changedFiles: string[]): PreflightCheck {
  if (mergeBase === undefined) {
    return { name: PREFLIGHT_CHECK_NAME.RED_TEST, status: CHK_UNKNOWN, detail: 'could not determine merge base' };
  }
  const redTestName = readRedTestName(docRoot, packetId);
  if (redTestName === '') {
    return { name: PREFLIGHT_CHECK_NAME.RED_TEST, status: CHK_SKIP, detail: 'no RED test section in packet document' };
  }
  for (const f of changedFiles) {
    if (!writeSet.some((g) => overlaps(g, f))) continue;
    try {
      const diff = execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.DIFF, `${mergeBase}...HEAD`, '--', f], { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim();
      if (diff.includes(redTestName)) {
        return { name: PREFLIGHT_CHECK_NAME.RED_TEST, status: CHK_PASS, detail: 'found test in diff' };
      }
    } catch { /* continue */ }
  }
  return { name: PREFLIGHT_CHECK_NAME.RED_TEST, status: CHK_FAIL, detail: 'RED test not found in diff' };
}

const _db = (s: PreflightCheck['status'], d: string): PreflightCheck => ({ name: 'deviation-bullets', status: s, detail: d });

function checkDeviationBullets(): PreflightCheck {
  return _db(CHK_SKIP, 'no deviation check is configured');
}

function getDocRoot(worktree: string): string {
  try {
    return execFileSync(GIT_EXECUTABLE, [GIT_ARGUMENT.REV_PARSE, '--show-toplevel'], { cwd: worktree, encoding: 'utf8' }).trim();
  } catch {
    return worktree;
  }
}

function getPacketWriteSet(store: Store, packetId: string): string[] {
  const row = store.db.prepare('SELECT write_set FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) return [];
  const parsed: unknown = JSON.parse(stringColumn(row, 'write_set'));
  return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
}

const HEAD_SHA_MATCH_UNKNOWN = CHK_UNKNOWN;

export async function runPreflight(
  store: Store,
  packetId: string,
  worktree: string,
  options?: { pr: string | undefined; persistEvent?: boolean },
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];

  const writeSet = getPacketWriteSet(store, packetId);
  const mergeBase = findMergeBase(worktree);
  const changedFiles = mergeBase !== undefined ? getChangedFiles(worktree, mergeBase) : [];

  const ws = checkWriteSet(writeSet, changedFiles);
  checks.push(ws.check);

  const sha = checkHeadSha(worktree);
  const prSha = fetchPrHeadSha(worktree, options?.pr);
  checks.push(headShaMatchCheck(sha, prSha));

  const ciChecks = checkCiStatus(worktree, options?.pr);
  checks.push(...ciChecks);

  const verifyResult = await runVerifyCheck(worktree);
  checks.push(verifyResult);

  const docRoot = getDocRoot(worktree);
  const redTestResult = checkRedTest(worktree, mergeBase, writeSet, docRoot, packetId, changedFiles);
  checks.push(redTestResult);

  const stopChecks: PreflightCheck[] = [];

  const devResult = checkDeviationBullets();
  checks.push(devResult);

  const failed = checks.some((c) => c.status === CHK_FAIL);
  const overall = failed ? CHK_FAIL : CHK_PASS;

  if (options?.persistEvent !== false) {
    store.db.prepare(INSERT_EVENT_SQL).run(
      null, packetId, EVENT_EVIDENCE, `${PREFLIGHT_EVENT_PREFIX}${overall}`, new Date().toISOString(),
    );
  }

  return {
    packetId,
    pr: options?.pr,
    headSha: sha,
    headShaMatch: HEAD_SHA_MATCH_UNKNOWN,
    ciChecks,
    verifyResult,
    writeSetViolations: ws.violations,
    redTestFound: redTestResult.status === CHK_PASS,
    stopConditions: stopChecks,
    deviationBullets: devResult.status === CHK_FAIL ? [devResult.detail] : [],
    checks,
    overall,
  };
}
