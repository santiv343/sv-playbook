import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { stringColumn } from '../db/rows.js';
import type { Store } from '../db/store.types.js';
import { overlaps } from '../tasks/write-set.js';
import { EVENT_EVIDENCE, INSERT_EVENT_SQL } from '../tasks/service.constants.js';
import { PREFLIGHT_CHECK_NAME, PREFLIGHT_EVENT_PREFIX, PREFLIGHT_STATUS, type PreflightCheck, type PreflightReport } from './preflight.types.js';
import { REVIEW_WORKTREE_DIR } from '../cli/commands/review.constants.js';
import { GIT_ARGUMENT, GIT_BASE_REFERENCE, GIT_EXECUTABLE } from '../git.constants.js';
import { TEXT_ENCODING } from '../platform.constants.js';

const CHK_PASS = PREFLIGHT_STATUS.PASS;
const CHK_FAIL = PREFLIGHT_STATUS.FAIL;
const CHK_SKIP = PREFLIGHT_STATUS.SKIP;
const CHK_UNKNOWN = PREFLIGHT_STATUS.UNKNOWN;
const GITHUB_CHECK_FIELD = { ROLLUP: 'statusCheckRollup' } as const;
const GITHUB_CHECK_STATE = { SUCCESS: 'SUCCESS', NEUTRAL: 'neutral' } as const;

const STOP_CONDITION_PATTERNS = [
  { name: 'console.log', pattern: /console\.(log|debug|warn|error)/ },
  { name: 'TODO', pattern: /\bTODO\b/ },
  { name: 'FIXME', pattern: /\bFIXME\b/ },
  { name: 'debugger', pattern: /\bdebugger\b/ },
  { name: '.only', pattern: /\.only\b/ },
];

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

function checkVerify(worktree: string): PreflightCheck {
  const cfgPath = join(worktree, 'playbook.config.json');
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

  const reviewDir = join(worktree, '.worktrees', REVIEW_WORKTREE_DIR);
  const reviewWt = join(reviewDir, `verify-${Date.now()}`);

  mkdirSync(reviewDir, { recursive: true });
  try {
    execFileSync(GIT_EXECUTABLE, ['worktree', 'add', '--detach', reviewWt, GIT_ARGUMENT.HEAD], { cwd: worktree, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_UNKNOWN, detail: 'could not create review worktree' };
  }

  try {
    execSync(config.verifyCommand, { cwd: reviewWt, timeout: 120_000, stdio: 'pipe' });
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_PASS, detail: `${config.verifyCommand} succeeded` };
  } catch {
    return { name: PREFLIGHT_CHECK_NAME.VERIFY, status: CHK_FAIL, detail: `${config.verifyCommand} failed` };
  } finally {
    try {
      execFileSync(GIT_EXECUTABLE, ['worktree', 'remove', '--force', reviewWt], { cwd: worktree, encoding: 'utf8', stdio: 'pipe' });
    } catch { /* cleanup failure is non-fatal */ }
  }
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

function checkStopConditions(worktree: string, changedFiles: string[]): PreflightCheck[] {
  if (changedFiles.length === 0) {
    return STOP_CONDITION_PATTERNS.map((sc) => ({ name: `stop:${sc.name}`, status: CHK_SKIP, detail: 'no changed files' }));
  }
  return STOP_CONDITION_PATTERNS.map((sc) => {
    for (const f of changedFiles) {
      try {
        const content = readFileSync(join(worktree, f), 'utf8');
        if (sc.pattern.test(content)) {
          return { name: `stop:${sc.name}`, status: CHK_FAIL, detail: `found in ${f}` };
        }
      } catch { /* ignore unreadable files */ }
    }
    return { name: `stop:${sc.name}`, status: CHK_PASS, detail: 'not found in changed files' };
  });
}

const _db = (s: PreflightCheck['status'], d: string): PreflightCheck => ({ name: 'deviation-bullets', status: s, detail: d });

function checkDeviationBullets(worktree: string): PreflightCheck {
  const base = findMergeBase(worktree);
  if (base === undefined) return _db(CHK_SKIP, 'could not find merge base');
  try {
    const log = execFileSync(GIT_EXECUTABLE, ['log', '--format=%B', `${base}...HEAD`], { cwd: worktree, encoding: 'utf8' }).trim();
    const bullets = log.split('\n').filter((line) => /DEVIATION/i.test(line));
    if (bullets.length > 0) return _db(CHK_FAIL, `found ${bullets.length} DEVIATION mention(s)`);
    return _db(CHK_PASS, 'no DEVIATION mentions');
  } catch {
    return _db(CHK_SKIP, 'could not read git log');
  }
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

export function runPreflight(
  store: Store,
  packetId: string,
  worktree: string,
  options?: { pr: string | undefined; persistEvent?: boolean },
): PreflightReport {
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

  const verifyResult = checkVerify(worktree);
  checks.push(verifyResult);

  const docRoot = getDocRoot(worktree);
  const redTestResult = checkRedTest(worktree, mergeBase, writeSet, docRoot, packetId, changedFiles);
  checks.push(redTestResult);

  const stopChecks = checkStopConditions(worktree, changedFiles);
  checks.push(...stopChecks);

  const devResult = checkDeviationBullets(worktree);
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
