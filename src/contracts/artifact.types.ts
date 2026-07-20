import type { ARTIFACT_CONTRACT_STATUS } from './artifact.constants.js';

export type ArtifactContractStatus = typeof ARTIFACT_CONTRACT_STATUS[keyof typeof ARTIFACT_CONTRACT_STATUS];

// El shape genérico que TODO contrato de artifact usa para registrarse
// (addArtifactContract) — review-candidate, review-verdict, y los
// contratos de protocolo comparten esta misma forma de entrada, aunque
// cada uno tenga su propio JSON Schema interno.
export interface ArtifactContractInput {
  ref: string;
  schema: Readonly<Record<string, unknown>>;
  status: ArtifactContractStatus;
}

export interface ArtifactContractCheck {
  valid: boolean;
  violations: readonly string[];
}
