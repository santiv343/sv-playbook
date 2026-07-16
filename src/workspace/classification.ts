import { execFileSync } from 'node:child_process';
import type { Store } from '../db/store.types.js';
import { GIT_ARGUMENT, GIT_EXECUTABLE } from '../git.constants.js';
import { EMPTY_SIZE, PATH_TOKEN, SINGLE_SIZE, TEXT_ENCODING } from '../platform.constants.js';
import * as s from '../schema/core.js';
import { packets } from '../tasks/schema.constants.js';
import type { PacketStatus } from '../tasks/service.types.js';
import { overlaps } from '../tasks/write-set.js';
import {
  CURRENT_PACKET_STATUSES,
  GIT_CHANGE_CODE,
  GIT_STATUS_RECORD,
  PLANNED_PACKET_STATUSES,
  TERMINAL_PACKET_STATUSES,
  WORKSPACE_OWNERSHIP,
} from './classification.constants.js';
import type {
  WorkspaceClassificationReport,
  WorkspaceClassificationSummary,
  WorkspaceOwner,
  WorkspaceOwnership,
  WorkspacePathClassification,
} from './classification.types.js';

interface PacketScope {
  readonly id: string;
  readonly status: PacketStatus;
  readonly writeSet: readonly string[];
}

interface GitChange {
  readonly path: string;
  readonly status: string;
}

const WRITE_SET_SCHEMA = s.json(s.array(s.string()));

function parseWriteSet(raw: string): readonly string[] {
  return WRITE_SET_SCHEMA.parse(raw);
}

function packetScopes(store: Store): readonly PacketScope[] {
  return store.orm.select({
    id: packets.id,
    status: packets.status,
    writeSetJson: packets.writeSetJson,
  }).from(packets).all().map((packet) => ({
    id: packet.id,
    status: packet.status,
    writeSet: parseWriteSet(packet.writeSetJson),
  }));
}

function normalizedPath(path: string): string {
  return path.replaceAll(PATH_TOKEN.WINDOWS_SEPARATOR, PATH_TOKEN.POSIX_SEPARATOR);
}

function isRenameOrCopy(status: string): boolean {
  return status.includes(GIT_CHANGE_CODE.RENAMED) || status.includes(GIT_CHANGE_CODE.COPIED);
}

function gitChanges(repoRoot: string): readonly GitChange[] {
  const output = execFileSync(GIT_EXECUTABLE, [
    GIT_ARGUMENT.STATUS,
    GIT_ARGUMENT.PORCELAIN_V1,
    GIT_ARGUMENT.NULL_TERMINATED,
    GIT_ARGUMENT.UNTRACKED_FILES_ALL,
  ], { cwd: repoRoot, encoding: TEXT_ENCODING.UTF8 });
  const records = output.split('\0');
  const changes = new Map<string, GitChange>();

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record === undefined || record.length < GIT_STATUS_RECORD.PATH_OFFSET) continue;
    const status = record.slice(0, GIT_STATUS_RECORD.STATUS_LENGTH);
    const path = normalizedPath(record.slice(GIT_STATUS_RECORD.PATH_OFFSET));
    changes.set(path, { path, status });
    if (!isRenameOrCopy(status)) continue;
    const originalPath = records[index + 1];
    if (originalPath !== undefined && originalPath.length > EMPTY_SIZE) {
      const normalizedOriginal = normalizedPath(originalPath);
      changes.set(normalizedOriginal, { path: normalizedOriginal, status });
      index++;
    }
  }

  return [...changes.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function ownersForPath(scopes: readonly PacketScope[], path: string): readonly WorkspaceOwner[] {
  return scopes.flatMap((scope) => {
    const matchedGlobs = scope.writeSet.filter((glob) => overlaps(glob, path));
    return matchedGlobs.length === EMPTY_SIZE ? [] : [{ id: scope.id, status: scope.status, matchedGlobs }];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function includesStatus(statuses: readonly PacketStatus[], status: PacketStatus): boolean {
  return statuses.includes(status);
}

function ownershipFor(owners: readonly WorkspaceOwner[]): WorkspaceOwnership {
  const nonTerminal = owners.filter((owner) => !includesStatus(TERMINAL_PACKET_STATUSES, owner.status));
  if (nonTerminal.length > SINGLE_SIZE) return WORKSPACE_OWNERSHIP.AMBIGUOUS;
  const owner = nonTerminal[0];
  if (owner !== undefined && includesStatus(CURRENT_PACKET_STATUSES, owner.status)) return WORKSPACE_OWNERSHIP.CURRENT;
  if (owner !== undefined && includesStatus(PLANNED_PACKET_STATUSES, owner.status)) return WORKSPACE_OWNERSHIP.PLANNED;
  return owners.length > EMPTY_SIZE ? WORKSPACE_OWNERSHIP.TERMINAL : WORKSPACE_OWNERSHIP.ORPHAN;
}

function emptySummary(): Record<WorkspaceOwnership, number> {
  return {
    [WORKSPACE_OWNERSHIP.CURRENT]: EMPTY_SIZE,
    [WORKSPACE_OWNERSHIP.PLANNED]: EMPTY_SIZE,
    [WORKSPACE_OWNERSHIP.AMBIGUOUS]: EMPTY_SIZE,
    [WORKSPACE_OWNERSHIP.TERMINAL]: EMPTY_SIZE,
    [WORKSPACE_OWNERSHIP.ORPHAN]: EMPTY_SIZE,
  };
}

function summarize(paths: readonly WorkspacePathClassification[]): WorkspaceClassificationSummary {
  const summary = emptySummary();
  for (const path of paths) summary[path.ownership]++;
  return summary;
}

export function classifyWorkspace(store: Store, repoRoot: string): WorkspaceClassificationReport {
  const scopes = packetScopes(store);
  const paths = gitChanges(repoRoot).map((change) => {
    const owners = ownersForPath(scopes, change.path);
    return { path: change.path, gitStatus: change.status, ownership: ownershipFor(owners), owners };
  });
  return { paths, summary: summarize(paths) };
}
