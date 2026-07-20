import type { PacketStatus } from '../tasks/service.types.js';
import type { WORKSPACE_OWNERSHIP } from './classification.constants.js';

export type WorkspaceOwnership = typeof WORKSPACE_OWNERSHIP[keyof typeof WORKSPACE_OWNERSHIP];

// matchedGlobs en WorkspaceOwner registra QUÉ entradas del write_set
// matchearon este path — auditoría de por qué un packet se considera
// "dueño" de un archivo, no sólo el hecho binario de que lo es.
export interface WorkspaceOwner {
  readonly id: string;
  readonly status: PacketStatus;
  readonly matchedGlobs: readonly string[];
}

export interface WorkspacePathClassification {
  readonly path: string;
  readonly gitStatus: string;
  readonly ownership: WorkspaceOwnership;
  readonly owners: readonly WorkspaceOwner[];
}

export type WorkspaceClassificationSummary = Readonly<Record<WorkspaceOwnership, number>>;

export interface WorkspaceClassificationReport {
  readonly paths: readonly WorkspacePathClassification[];
  readonly summary: WorkspaceClassificationSummary;
}
