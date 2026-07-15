import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openStore } from '../db/store.js';
import { createStateBackup } from '../db/backup.js';
import { BACKUP_REASON } from '../db/backup.constants.js';
import { reconcile } from './reconcile.js';
import type { GhReader, ReconcilerExecutor, ReconcilerEvent, ReconcilerRow } from './reconcile.types.js';
import {
  RECONCILE_COMMAND,
  RECONCILE_DRIVER_METHOD,
  RECONCILE_SAFETY,
  RECONCILER_ACTOR,
} from './reconcile.constants.js';

interface CallCapture { method: string; args: readonly unknown[] }

function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  return mkdtemp(join(tmpdir(), 'svp-reconcile-')).then(async (root) => {
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', [
      '-c', 'user.email=test@sv-playbook.local',
      '-c', 'user.name=sv-playbook test',
      'commit', '--allow-empty', '-m', 'initialize fixture',
    ], { cwd: root });
    const previous = process.cwd();
    process.chdir(root);
    try { return await fn(); } finally { process.chdir(previous); }
  });
}

function insertPacket(id: string, status: string, pr: string | null): void {
  const store = openStore(process.cwd());
  try {
    store.db.prepare(
      'INSERT INTO packets (id, title, path, status, body, write_set, type, pr, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(id, `Test ${id}`, `docs/packets/${id}.md`, status, '', '[]', '', pr, new Date().toISOString(), new Date().toISOString());
  } finally {
    store.close();
  }
}

test('reconcile computes divergences as an action table and applies only the safe rows', async () => {
  await inTempRepo(async () => {
    // Seed: ONE done packet, then backup, then ANOTHER done packet so backup
    // terminal count regresses (stale backup condition)
    await writeFile('body.md', 'test\n');
    insertPacket('DONE-BASE-001', 'done', null);
    createStateBackup(process.cwd(), { reason: BACKUP_REASON.MANUAL });
    insertPacket('DONE-BASE-002', 'done', null);

    // Seed: a review packet with a merged PR
    insertPacket('FLOW-TEST-001', 'review', '5');

    // Stub GH: BEHIND auto-merge PR + CONFLICTING PR
    const behindPr = {
      number: '10', state: 'OPEN' as const,
      mergeStateStatus: 'BEHIND' as const,
      headRefName: 'feature/behind', baseRefName: 'main', isDraft: false,
    };
    const conflictPr = {
      number: '20', state: 'OPEN' as const,
      mergeStateStatus: 'DIRTY' as const,
      headRefName: 'feature/conflict', baseRefName: 'main', isDraft: false,
    };

    const stubGh: GhReader = {
      listOpenPrs: () => [behindPr, conflictPr],
      prState: (pr: string) => pr === '5' ? 'MERGED' : 'OPEN',
    };

    const executed: string[] = [];
    const events: ReconcilerEvent[] = [];
    const stubExec: ReconcilerExecutor = {
      updateBranch: (pr: string) => { executed.push(`update-branch ${pr}`); },
      taskClose: (packetId: string, pr: string) => { executed.push(`task-close ${packetId} --pr ${pr}`); },
      createBackup: () => { executed.push('backup'); },
      recordEvent: (e: ReconcilerEvent) => { events.push(e); },
    };

    const store = openStore(process.cwd());
    // DRY RUN
    const dry = reconcile(store, process.cwd(), stubGh, stubExec, { dryRun: true });

    assert.equal(dry.rows.length, 4, `expected 4 rows, got ${dry.rows.length}: ${JSON.stringify(dry.rows)}`);
    const behindRow = dry.rows.find((r) => r.command.includes('update-branch'));
    assert.ok(behindRow, 'missing behind-PR divergence');
    assert.equal(behindRow.safety, 'safe');

    const reviewRow = dry.rows.find((r) => r.command.includes('task close'));
    assert.ok(reviewRow, 'missing review-merged divergence');
    assert.equal(reviewRow.safety, 'safe');

    const backupRow = dry.rows.find((r) => r.command === RECONCILE_COMMAND.BACKUP);
    assert.ok(backupRow, 'missing stale-backup divergence');
    assert.equal(backupRow.safety, 'safe');

    const conflictRow = dry.rows.find((r) => r.command.startsWith('gh pr') && r.divergence.toLowerCase().includes('conflict'));
    assert.ok(conflictRow, 'missing conflicting-PR divergence');
    assert.equal(conflictRow.safety, 'unsafe');

    assert.equal(executed.length, 0, 'dry run must not execute any action');

    // APPLY (--apply)
    events.length = 0;
    executed.length = 0;
    const apply = reconcile(store, process.cwd(), stubGh, stubExec, { dryRun: false });

    store.close();

    // Exactly the 3 safe rows executed
    assert.equal(executed.length, 3, `expected 3 executed, got ${executed.length}: ${executed.join(', ')}`);
    assert.ok(executed.some((e) => e.startsWith('update-branch 10')), 'branch not updated');
    assert.ok(executed.some((e) => e.startsWith('task-close')), 'task not closed');
    assert.ok(executed.some((e) => e === RECONCILE_COMMAND.BACKUP), 'backup not created');

    // Conflicting PR is NOT executed
    assert.ok(!executed.some((e) => e.includes('20')), 'conflicting PR was executed');

    // Events recorded for each executed action
    assert.ok(events.length >= 3, `expected >=3 events, got ${events.length}`);
    assert.ok(events.every((e) => e.who === RECONCILER_ACTOR), 'all events must have who=reconciler');
    assert.ok(apply.rows.every((r) => r.executed === (r.safety === RECONCILE_SAFETY.SAFE)), 'executed flag mismatch');
  });
});

test('apply builds the exact argv for each safe action and refuses partial commands', async () => {
  await inTempRepo(async () => {
    insertPacket('REVIEW-001', 'review', '42');

    const validPr = {
      number: '129', state: 'OPEN' as const,
      mergeStateStatus: 'BEHIND' as const,
      headRefName: 'feature/fix', baseRefName: 'main', isDraft: false,
    };
    const corruptPr = {
      number: '', state: 'OPEN' as const,
      mergeStateStatus: 'BEHIND' as const,
      headRefName: 'feature/corrupt', baseRefName: 'main', isDraft: false,
    };
    const conflictPr = {
      number: '130', state: 'OPEN' as const,
      mergeStateStatus: 'DIRTY' as const,
      headRefName: 'feature/conflict', baseRefName: 'main', isDraft: false,
    };

    const stubGh: GhReader = {
      listOpenPrs: () => [validPr, corruptPr, conflictPr],
      prState: (pr: string) => pr === '42' ? 'MERGED' : 'OPEN',
    };

    const calls: CallCapture[] = [];
    const stubExec: ReconcilerExecutor = {
      updateBranch: (pr: string) => { calls.push({ method: 'updateBranch', args: [pr] }); },
      taskClose: (packetId: string, pr: string) => { calls.push({ method: 'taskClose', args: [packetId, pr] }); },
      createBackup: () => { calls.push({ method: 'createBackup', args: [] }); },
      recordEvent: () => {},
    };

    await writeFile('playbook.config.json', JSON.stringify({ productName: 'test', backup: { enabled: false } }));

    const store = openStore(process.cwd());
    try {
      const result = reconcile(store, process.cwd(), stubGh, stubExec, { dryRun: false });

      const upd = calls.find((c) => c.method === RECONCILE_DRIVER_METHOD.UPDATE_BRANCH);
      assert.ok(upd, 'updateBranch must be called for valid PR');
      assert.deepEqual(upd.args, ['129']);

      const close = calls.find((c) => c.method === RECONCILE_DRIVER_METHOD.TASK_CLOSE);
      assert.ok(close, 'taskClose must be called for merged review PR');
      assert.deepEqual(close.args, ['REVIEW-001', '42']);

      assert.equal(calls.length, 2, `expected 2 calls, got ${calls.length}: ${JSON.stringify(calls)} — corrupt PR must be refused`);

      const behindRows = result.rows.filter((r: ReconcilerRow) => r.command.startsWith('gh pr update-branch'));
      assert.equal(behindRows.length, 2, 'expected 2 behind-PR rows in result');
      const refusedRow = behindRows.find((r: ReconcilerRow) => !r.executed);
      assert.ok(refusedRow, 'corrupt behind row must be refused (not executed)');
      const validRow = behindRows.find((r: ReconcilerRow) => r.executed);
      assert.ok(validRow, 'valid behind row must be executed');
    } finally {
      store.close();
    }
  });
});
