export type OpenCodeOutputStatus = 'pending' | 'accepted' | 'ambiguous' | 'rejected';

export interface OpenCodeOutputReconciliation {
  status: OpenCodeOutputStatus;
  responseMessageIds: readonly string[];
  rawText?: string;
  violations: readonly string[];
}
