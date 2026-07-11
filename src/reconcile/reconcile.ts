import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { STATUS } from '../tasks/service.constants.js';
import { backupCheck, reviewMergedCheckFromStore } from '../cli/commands/doctor.js';
import type { CheckResult } from '../cli/commands/doctor.types.js';
import type { ReconcilerRow, ReconcilerResult, ReconcilerEvent, GhReader, ReconcilerExecutor, PrInfo } from './reconcile.types.js';

const now = (): string => new Date().toISOString();

function behindPrRows(openPrs: PrInfo[]): ReconcilerRow[] {
  return openPrs
    .filter((pr) => pr.mergeStateStatus === 'BEHIND')
    .map((pr) => ({
      divergence: `PR #${pr.number} is behind ${pr.baseRefName}`,
      action: `Update branch for PR #${pr.number}`,
      command: `gh pr update-branch ${pr.number}`,
      safety: 'safe' as const,
      detail: `${pr.headRefName} is BEHIND ${pr.baseRefName}`,
      executed: false,
    }));
}

function conflictPrRows(openPrs: PrInfo[]): ReconcilerRow[] {
  return openPrs
    .filter((pr) => pr.mergeStateStatus === 'DIRTY' || pr.mergeStateStatus === 'BLOCKED')
    .map((pr) => ({
      divergence: `Conflicting PR #${pr.number}`,
      action: `Report conflict in PR #${pr.number}`,
      command: `gh pr view ${pr.number}`,
      safety: 'unsafe' as const,
      detail: `PR #${pr.number} (${pr.headRefName}) has merge status ${pr.mergeStateStatus}`,
      executed: false,
    }));
}

function reviewMergedRows(store: Store, gh: GhReader, reviewCheck: CheckResult): ReconcilerRow[] {
  if (reviewCheck.status !== 'warn' && reviewCheck.status !== 'fail') return [];

  const reviewPackets = store.db.prepare(
    'SELECT id, pr FROM packets WHERE status = ? AND pr IS NOT NULL',
  ).all(STATUS.REVIEW);

  const rows: ReconcilerRow[] = [];
  for (const packetRow of reviewPackets) {
    const packetId = stringColumn(packetRow, 'id');
    const prValue = stringColumn(packetRow, 'pr');
    const prState = gh.prState(prValue);
    if (prState === 'MERGED') {
      rows.push({
        divergence: `Packet ${packetId} in review with merged PR #${prValue}`,
        action: `Close ${packetId} as done`,
        command: `task close ${packetId} --pr ${prValue}`,
        safety: 'safe' as const,
        detail: `PR #${prValue} merged, packet ${packetId} ready to close`,
        executed: false,
      });
    }
  }
  return rows;
}

function backupRow(bupCheck: CheckResult): ReconcilerRow | undefined {
  if (bupCheck.status !== 'warn' && bupCheck.status !== 'fail') return undefined;

  return {
    divergence: 'Backup is stale or regressed',
    action: 'Create a fresh backup',
    command: 'backup',
    safety: 'safe' as const,
    detail: bupCheck.detail,
    executed: false,
  };
}

function updateBranchAction(row: ReconcilerRow, exec: ReconcilerExecutor): void {
  const parts = row.command.split(' ');
  const pr = parts[parts.length - 1];
  if (pr !== undefined) exec.updateBranch(pr);
}

function taskCloseAction(row: ReconcilerRow, exec: ReconcilerExecutor): void {
  const parts = row.command.split(' ');
  const packetId = parts[2];
  const prValue = parts[4];
  if (packetId !== undefined && prValue !== undefined) exec.taskClose(packetId, prValue);
}

function dispatchAction(row: ReconcilerRow, exec: ReconcilerExecutor): void {
  if (row.command.startsWith('gh pr update-branch')) {
    updateBranchAction(row, exec);
  } else if (row.command.startsWith('task close')) {
    taskCloseAction(row, exec);
  } else if (row.command === 'backup') {
    exec.createBackup();
  }
}

function applyRow(row: ReconcilerRow, exec: ReconcilerExecutor, events: ReconcilerEvent[]): void {
  if (row.safety !== 'safe') return;
  const before = JSON.stringify(row);
  dispatchAction(row, exec);
  row.executed = true;
  const after = JSON.stringify(row);
  const event: ReconcilerEvent = { who: 'reconciler', what: row.action, before, after, at: now() };
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
  const bupCheck = backupCheck(repoRoot);
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
