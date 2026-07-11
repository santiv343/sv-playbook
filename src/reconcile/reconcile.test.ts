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
import type { GhReader, ReconcilerExecutor, ReconcilerEvent } from './reconcile.types.js';

function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  return mkdtemp(join(tmpdir(), 'svp-reconcile-')).then(async (root) => {
    execFileSync('git', ['init'], { cwd: root });
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

    assert.equal(dry.rows.length, 4, `expected 4 rows, got ${dry.rows.length}`);
    const behindRow = dry.rows.find((r) => r.command.includes('update-branch'));
    assert.ok(behindRow, 'missing behind-PR divergence');
    assert.equal(behindRow.safety, 'safe');

    const reviewRow = dry.rows.find((r) => r.command.includes('task close'));
    assert.ok(reviewRow, 'missing review-merged divergence');
    assert.equal(reviewRow.safety, 'safe');

    const backupRow = dry.rows.find((r) => r.command === 'backup');
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
    assert.ok(executed.some((e) => e === 'backup'), 'backup not created');

    // Conflicting PR is NOT executed
    assert.ok(!executed.some((e) => e.includes('20')), 'conflicting PR was executed');

    // Events recorded for each executed action
    assert.ok(events.length >= 3, `expected >=3 events, got ${events.length}`);
    assert.ok(events.every((e) => e.who === 'reconciler'), 'all events must have who=reconciler');
    assert.ok(apply.rows.every((r) => r.executed === (r.safety === 'safe')), 'executed flag mismatch');
  });
});
