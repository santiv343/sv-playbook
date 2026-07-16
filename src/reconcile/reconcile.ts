import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { STATUS } from '../tasks/service.constants.js';
import { backupCheckFromStore, reviewMergedCheckFromStore } from '../cli/commands/doctor.js';
import type { CheckResult } from '../cli/commands/doctor.types.js';
import type { ReconcilerRow, ReconcilerResult, ReconcilerEvent, GhReader, ReconcilerExecutor, PrInfo } from './reconcile.types.js';
import { PR_MERGE_STATE, PR_STATE, RECONCILE_COMMAND, RECONCILE_COMMAND_PREFIX, RECONCILER_ACTOR, RECONCILE_SAFETY } from './reconcile.constants.js';
import { DOCTOR_STATUS } from '../cli/commands/doctor.constants.js';

const now = (): string => new Date().toISOString();

function behindPrRows(openPrs: PrInfo[]): ReconcilerRow[] {
  return openPrs
    .filter((pr) => pr.mergeStateStatus === PR_MERGE_STATE.BEHIND)
    .map((pr) => ({
      divergence: `PR #${pr.number} is behind ${pr.baseRefName}`,
      action: `Update branch for PR #${pr.number}`,
      command: `gh pr update-branch ${pr.number}`,
      safety: RECONCILE_SAFETY.SAFE,
      detail: `${pr.headRefName} is BEHIND ${pr.baseRefName}`,
      executed: false,
      args: { pr: pr.number },
    }));
}

function conflictPrRows(openPrs: PrInfo[]): ReconcilerRow[] {
  return openPrs
    .filter((pr) => pr.mergeStateStatus === PR_MERGE_STATE.DIRTY || pr.mergeStateStatus === PR_MERGE_STATE.BLOCKED)
    .map((pr) => ({
      divergence: `Conflicting PR #${pr.number}`,
      action: `Report conflict in PR #${pr.number}`,
      command: `gh pr view ${pr.number}`,
      safety: RECONCILE_SAFETY.UNSAFE,
      detail: `PR #${pr.number} (${pr.headRefName}) has merge status ${pr.mergeStateStatus}`,
      executed: false,
      args: { pr: pr.number },
    }));
}

function reviewMergedRows(store: Store, gh: GhReader, reviewCheck: CheckResult): ReconcilerRow[] {
  if (reviewCheck.status !== DOCTOR_STATUS.WARN && reviewCheck.status !== DOCTOR_STATUS.FAIL) return [];

  const reviewPackets = store.db.prepare(
    'SELECT id, pr FROM packets WHERE status = ? AND pr IS NOT NULL',
  ).all(STATUS.REVIEW);

  const rows: ReconcilerRow[] = [];
  for (const packetRow of reviewPackets) {
    const packetId = stringColumn(packetRow, 'id');
    const prValue = stringColumn(packetRow, 'pr');
    const prState = gh.prState(prValue);
    if (prState === PR_STATE.MERGED) {
      rows.push({
        divergence: `Packet ${packetId} in review with merged PR #${prValue}`,
        action: `Close ${packetId} as done`,
        command: `task close ${packetId} --pr ${prValue}`,
        safety: RECONCILE_SAFETY.SAFE,
        detail: `PR #${prValue} merged, packet ${packetId} ready to close`,
        executed: false,
        args: { packetId, pr: prValue },
      });
    }
  }
  return rows;
}

function backupRow(bupCheck: CheckResult): ReconcilerRow | undefined {
  if (bupCheck.status !== DOCTOR_STATUS.WARN && bupCheck.status !== DOCTOR_STATUS.FAIL) return undefined;

  return {
    divergence: 'Backup is stale or regressed',
    action: 'Create a fresh backup',
    command: 'backup',
    safety: RECONCILE_SAFETY.SAFE,
    detail: bupCheck.detail,
    executed: false,
    args: {},
  };
}

function dispatchAction(row: ReconcilerRow, exec: ReconcilerExecutor): void {
  if (row.command.startsWith(RECONCILE_COMMAND_PREFIX.UPDATE_BRANCH)) {
    exec.updateBranch(row.args['pr'] ?? '');
  } else if (row.command.startsWith(RECONCILE_COMMAND_PREFIX.TASK_CLOSE)) {
    exec.taskClose(row.args['packetId'] ?? '', row.args['pr'] ?? '');
  } else if (row.command === RECONCILE_COMMAND.BACKUP) {
    exec.createBackup();
  }
}

function applyRow(row: ReconcilerRow, exec: ReconcilerExecutor, events: ReconcilerEvent[]): void {
  if (row.safety !== RECONCILE_SAFETY.SAFE) return;

  const hasEmptyArg = Object.values(row.args).some((v) => v === '');
  if (hasEmptyArg) {
    const event: ReconcilerEvent = { who: RECONCILER_ACTOR, what: `REFUSED: ${row.action} (partial args)`, before: JSON.stringify(row), after: JSON.stringify(row), at: now() };
    events.push(event);
    exec.recordEvent(event);
    return;
  }

  const before = JSON.stringify(row);
  dispatchAction(row, exec);
  row.executed = true;
  const after = JSON.stringify(row);
  const event: ReconcilerEvent = { who: RECONCILER_ACTOR, what: row.action, before, after, at: now() };
  events.push(event);
  exec.recordEvent(event);
}

export function reconcile(
  store: Store,
  repoRoot: string,
  gh: GhReader,
  exec: ReconcilerExecutor,
  options: { dryRun: boolean },
): ReconcilerResult {
  const reviewCheck = reviewMergedCheckFromStore(store);
  const bupCheck = backupCheckFromStore(store, repoRoot);
  const openPrs = gh.listOpenPrs();

  const rows: ReconcilerRow[] = [
    ...behindPrRows(openPrs),
    ...conflictPrRows(openPrs),
    ...reviewMergedRows(store, gh, reviewCheck),
  ];
  const bRow = backupRow(bupCheck);
  if (bRow !== undefined) rows.push(bRow);

  const events: ReconcilerEvent[] = [];
  if (!options.dryRun) {
    for (const row of rows) {
      applyRow(row, exec, events);
    }
  }

  return { rows, events };
}
