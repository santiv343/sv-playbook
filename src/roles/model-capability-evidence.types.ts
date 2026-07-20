// Evidencia MANUAL/externa de que un modelo tiene cierta capacidad —
// distinta de model_capability_evaluations (el examen automático de 3
// casos, model-capability-evaluation.ts): esto es para capacidades que no
// se pueden evaluar con ese examen genérico, aportadas con referencia +
// digest verificables (evidenceRef/evidenceDigest) en vez de auto-generadas.
export interface ModelCapabilityEvidenceInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly variant?: string;
  readonly capabilityId: string;
  readonly evidenceRef: string;
  readonly evidenceDigest: string;
  readonly assessedAt: string;
  readonly expiresAt: string;
}

export interface ModelCapabilityEvidenceReceipt extends ModelCapabilityEvidenceInput {
  readonly id: string;
  readonly createdAt: string;
}

export interface ModelCapabilityEvidenceCheck {
  readonly valid: boolean;
  readonly violations: readonly string[];
}
