import { test } from 'node:test';
import assert from 'node:assert/strict';

/*
 * BUG-015 Structured Delta — False Claim Quality Fixtures
 *
 * Each fixture documents one prior INCIDENT where the implementer claimed a
 * fix was correct (IMPLEMENTER-CLAIM-QUALITY) and/or the technical lead
 * accepted an incomplete fix (TL-ACCEPTANCE-QUALITY).
 *
 * These are HONEST ABOUT THEIR LIMITATIONS: they only prove that structured
 * records exist. They do NOT replace the RED tests in the files below —
 * each RED test enforces one fix. These fixtures exist for audit trail and
 * should be linked to a CHECK-SELF/HONESTY review that validates the RED
 * tests are actually running and failing as intended.
 */

interface FalseClaimFixture {
  readonly id: number;
  readonly tag: string;
  readonly implementerClaim: string;
  readonly tlAcceptance: string;
  readonly actualBug: string;
  readonly fixFile: string;
}

const FALSE_CLAIMS: readonly FalseClaimFixture[] = [
  {
    id: 1,
    tag: 'stopDaemonChild-unconditional-kill',
    implementerClaim: 'stopDaemonChild safely waits then conditionally force-kills the child process',
    tlAcceptance: 'Reviewed and approved the stopDaemonChild helper',
    actualBug: 'After waitMs(5000), forceKillProcess(child.pid) was called unconditionally without rechecking child.exitCode === null. forceKillProcess also did not verify the PID was still owned by the child.',
    fixFile: 'src/redteam/daemon-context.test.ts',
  },
  {
    id: 2,
    tag: 'session-binding-sequential',
    implementerClaim: 'Session-binding test validates concurrent worktree isolation through the daemon',
    tlAcceptance: 'Approved the concurrent session isolation coverage',
    actualBug: 'Test ran sequentially (wt1 then wt2) with a single shared packet. Did not assert exitCode 0 on HTTP responses. Did not verify canonical worktree values in session rows. Did not assert event-to-session binding with distinct session IDs.',
    fixFile: 'src/redteam/daemon-context.test.ts',
  },
  {
    id: 3,
    tag: 'active-handler-drain-missing',
    implementerClaim: 'Shutdown lifecycle includes drain of in-flight handlers',
    tlAcceptance: 'Approved shutdown coverage',
    actualBug: 'No test existed that started a daemon, sent a long-running exec request, called stop() during exec, and verified stop() completes after the handler finishes and the exec response is received.',
    fixFile: 'src/redteam/daemon-context.test.ts',
  },
  {
    id: 4,
    tag: 'exactly-once-cleanup-no-verify',
    implementerClaim: 'finalizeOnce is proven to run exactly once via the double-stop test',
    tlAcceptance: 'Approved exactly-once cleanup verification',
    actualBug: 'The "second stop resolves immediately" test did not inject a finalizer counter or assert state transitions (running→stopping→stopped). Did not verify store.close was called exactly once.',
    fixFile: 'src/redteam/daemon-context.test.ts',
  },
  {
    id: 5,
    tag: 'stopping-rejection-internal-state',
    implementerClaim: 'New exec requests are rejected after stop via observable behavior',
    tlAcceptance: 'Approved the rejection behavior test',
    actualBug: 'The concurrent-stop test tested internal promise identity (s1 === s2) instead of observable behavior (503 status code or ECONNREFUSED on new exec requests after stop).',
    fixFile: 'src/redteam/daemon-context.test.ts',
  },
  {
    id: 6,
    tag: 'symlink-skip-falsy-expression',
    implementerClaim: 'Symlink tests skip correctly when symlinks are unavailable',
    tlAcceptance: 'Approved the symlink skip logic',
    actualBug: 'The skip expression !canSymlinkDir() && symSkip is falsy on non-Windows when symlinks are unavailable (symSkip = ""), so the test runs and fails. Not an explicit boolean.',
    fixFile: 'src/runtime/workspace.test.ts',
  },
  {
    id: 7,
    tag: 'daemon-hang-on-server-error',
    implementerClaim: 'Daemon exits cleanly when the server errors after startup',
    tlAcceptance: 'Approved server-error lifecycle coverage',
    actualBug: 'DaemonInstance had no done/termination promise. The CLI composition root only resolved on signal or startup rejection. If the store or server died after startup, the daemon process hung forever with no way to terminate.',
    fixFile: 'src/daemon/daemon.types.ts, src/daemon/daemon.ts, src/cli/commands/daemon.ts',
  },
  {
    id: 8,
    tag: 'claim-quality-fixtures-missing',
    implementerClaim: 'All 7 prior false-claim incidents are recorded as fixtures',
    tlAcceptance: 'Approved the fixture records',
    actualBug: 'No structured fixtures existed documenting the 7 prior false-claim incidents with IMPLEMENTER-CLAIM-QUALITY and TL-ACCEPTANCE-QUALITY provenance.',
    fixFile: 'this file — src/redteam/claim-quality-fixtures.test.ts',
  },
];

test('BUG-015 false-claim quality fixtures exist for all 8 incidents', () => {
  assert.equal(FALSE_CLAIMS.length, 8, 'must have exactly 8 false-claim fixtures');

  const tags = new Set<string>();
  for (const fixture of FALSE_CLAIMS) {
    assert.ok(!tags.has(fixture.tag), `duplicate tag: ${fixture.tag}`);
    tags.add(fixture.tag);
    assert.ok(fixture.implementerClaim.length > 10, `fixture ${fixture.id} must have implementerClaim`);
    assert.ok(fixture.tlAcceptance.length > 10, `fixture ${fixture.id} must have tlAcceptance`);
    assert.ok(fixture.actualBug.length > 20, `fixture ${fixture.id} must have actualBug`);
    assert.ok(fixture.fixFile.length > 5, `fixture ${fixture.id} must have fixFile`);
  }

  // Verify each fixture by tag to ensure the records are correct
  const knownTags = [
    'stopDaemonChild-unconditional-kill',
    'session-binding-sequential',
    'active-handler-drain-missing',
    'exactly-once-cleanup-no-verify',
    'stopping-rejection-internal-state',
    'symlink-skip-falsy-expression',
    'daemon-hang-on-server-error',
    'claim-quality-fixtures-missing',
  ];
  for (const tag of knownTags) {
    const fixture = FALSE_CLAIMS.find((f) => f.tag === tag);
    assert.ok(fixture !== undefined, `fixture with tag ${tag} must exist`);
    assert.ok(fixture.tag.length > 0);
  }
});
