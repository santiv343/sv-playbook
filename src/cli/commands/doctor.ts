import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { latestStateBackupAgeHours } from '../../db/backup.js';
import { PACKETS_DIR, PACKETS_DOCS_DIR, LEASE_TTL_MS, STATUS } from '../../tasks/service.constants.js';
import { stringColumn } from '../../db/rows.js';
import { loadConfig } from '../../config.js';
import {
  DOCTOR_DETAIL,
  DOCTOR_LABEL,
  DOCTOR_STATUS,
  DOCTOR_USAGE,
  MIN_NODE_MAJOR,
  MIN_NODE_MINOR,
} from './doctor.constants.js';
import type { CheckResult } from './doctor.types.js';

function nodeVersionOk(): boolean {
  const [majorRaw, minorRaw] = process.versions.node.split('.');
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return false;
  return major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
}

function nodeCheck(): CheckResult {
  return {
    label: DOCTOR_LABEL.NODE,
    status: nodeVersionOk() ? DOCTOR_STATUS.OK : DOCTOR_STATUS.FAIL,
    detail: `v${process.versions.node} (requires >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0)`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gitCheck(repoRoot: string): CheckResult {
  return { label: DOCTOR_LABEL.GIT, status: DOCTOR_STATUS.OK, detail: repoRoot };
}

function storeCheck(repoRoot: string): CheckResult {
  try {
    const store = openStore(repoRoot);
    store.close();
    return { label: DOCTOR_LABEL.STORE, status: DOCTOR_STATUS.OK, detail: DOCTOR_DETAIL.SCHEMA_CURRENT };
  } catch (error) {
    return { label: DOCTOR_LABEL.STORE, status: DOCTOR_STATUS.FAIL, detail: errorMessage(error) };
  }
}

function packetsCheck(repoRoot: string): CheckResult {
  const path = join(repoRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  if (existsSync(path)) return { label: DOCTOR_LABEL.PACKETS, status: DOCTOR_STATUS.OK, detail: path };
  return { label: DOCTOR_LABEL.PACKETS, status: DOCTOR_STATUS.WARN, detail: `missing ${PACKETS_DOCS_DIR}/${PACKETS_DIR}` };
}

function leaseSummary(rows: unknown[]): string {
  let fresh = 0;
  let stale = 0;
  for (const row of rows) {
    const heartbeatAt = stringColumn(row, 'heartbeat_at');
    if (Date.now() - Date.parse(heartbeatAt) > LEASE_TTL_MS) stale++;
    else fresh++;
  }
  return `${fresh} fresh, ${stale} stale`;
}

function leasesCheck(repoRoot: string): CheckResult {
  try {
    const store = openStore(repoRoot);
    try {
      const rows = store.db.prepare('SELECT heartbeat_at FROM leases').all();
      return { label: DOCTOR_LABEL.LEASES, status: DOCTOR_STATUS.OK, detail: leaseSummary(rows) };
    } finally {
      store.close();
    }
  } catch (error) {
    return { label: DOCTOR_LABEL.LEASES, status: DOCTOR_STATUS.FAIL, detail: errorMessage(error) };
  }
}

function backupCheck(repoRoot: string): CheckResult {
  const config = loadConfig(repoRoot);
  if (!config.backup.enabled) {
    return { label: DOCTOR_LABEL.BACKUP, status: DOCTOR_STATUS.OK, detail: DOCTOR_DETAIL.BACKUP_DISABLED };
  }
  const age = latestStateBackupAgeHours(repoRoot);
  if (age === undefined) {
    return { label: DOCTOR_LABEL.BACKUP, status: DOCTOR_STATUS.WARN, detail: DOCTOR_DETAIL.NO_BACKUP };
  }
  const status = age >= config.backup.maxAgeHours ? DOCTOR_STATUS.WARN : DOCTOR_STATUS.OK;
  return { label: DOCTOR_LABEL.BACKUP, status, detail: `${age.toFixed(1)} hours old` };
}

function activeWithoutLeaseCheck(repoRoot: string): CheckResult {
  try {
    const store = openStore(repoRoot);
    try {
      const rows = store.db.prepare(
        'SELECT p.id FROM packets p LEFT JOIN leases l ON p.id = l.packet_id WHERE p.status = ? AND l.packet_id IS NULL',
      ).all(STATUS.ACTIVE);
      if (rows.length === 0) {
        return { label: DOCTOR_LABEL.ACTIVE_LEASES, status: DOCTOR_STATUS.OK, detail: 'all active packets leased' };
      }
      const ids = rows.map((row) => stringColumn(row, 'id')).join(', ');
      return { label: DOCTOR_LABEL.ACTIVE_LEASES, status: DOCTOR_STATUS.WARN, detail: `active without lease: ${ids}` };
    } finally {
      store.close();
    }
  } catch (error) {
    return { label: DOCTOR_LABEL.ACTIVE_LEASES, status: DOCTOR_STATUS.FAIL, detail: errorMessage(error) };
  }
}

function collectChecks(): CheckResult[] {
  const checks = [nodeCheck()];
  try {
    const repoRoot = commonRoot(process.cwd());
    checks.push(
      gitCheck(repoRoot),
      storeCheck(repoRoot),
      packetsCheck(repoRoot),
      leasesCheck(repoRoot),
      activeWithoutLeaseCheck(repoRoot),
      backupCheck(repoRoot),
    );
  } catch (error) {
    checks.push(
      { label: DOCTOR_LABEL.GIT, status: DOCTOR_STATUS.FAIL, detail: errorMessage(error) },
      { label: DOCTOR_LABEL.STORE, status: DOCTOR_STATUS.FAIL, detail: DOCTOR_DETAIL.GIT_ROOT_UNAVAILABLE },
      { label: DOCTOR_LABEL.PACKETS, status: DOCTOR_STATUS.FAIL, detail: DOCTOR_DETAIL.GIT_ROOT_UNAVAILABLE },
      { label: DOCTOR_LABEL.LEASES, status: DOCTOR_STATUS.FAIL, detail: DOCTOR_DETAIL.GIT_ROOT_UNAVAILABLE },
      { label: DOCTOR_LABEL.ACTIVE_LEASES, status: DOCTOR_STATUS.FAIL, detail: DOCTOR_DETAIL.GIT_ROOT_UNAVAILABLE },
      { label: DOCTOR_LABEL.BACKUP, status: DOCTOR_STATUS.FAIL, detail: DOCTOR_DETAIL.GIT_ROOT_UNAVAILABLE },
    );
  }
  return checks;
}

function renderCheck(check: CheckResult, io: Io): void {
  io.out(`${check.label}: ${check.status} - ${check.detail}`);
}

export function doctorCommand(): Command {
  return {
    name: 'doctor',
    summary: 'Diagnose Node, git, store, packet, and lease health',
    run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
      if (parsed.positionals.length > 0) {
        io.err(DOCTOR_USAGE);
        return Promise.resolve(EXIT.USAGE);
      }
      const checks = collectChecks();
      if (parsed.values.json === true) io.out(JSON.stringify(checks));
      else for (const check of checks) renderCheck(check, io);
      const failed = checks.some((check) => check.status === DOCTOR_STATUS.FAIL);
      return Promise.resolve(failed ? EXIT.GATE_FAIL : EXIT.OK);
    },
  };
}
