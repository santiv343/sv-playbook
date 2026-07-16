import type { ARTIFACT_CONTRACT_STATUS } from './artifact.constants.js';

export type ArtifactContractStatus = typeof ARTIFACT_CONTRACT_STATUS[keyof typeof ARTIFACT_CONTRACT_STATUS];

export interface ArtifactContractInput {
  ref: string;
  schema: Readonly<Record<string, unknown>>;
  status: ArtifactContractStatus;
}

export interface ArtifactContractCheck {
  valid: boolean;
  violations: readonly string[];
}
