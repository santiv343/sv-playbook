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
