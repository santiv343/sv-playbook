// "Reconciliation" ata una propuesta de vocabulario (EscalationReconciliationProposal,
// qué clases de escalación nuevas se necesitan y por qué) con su revisión
// (EscalationReconciliationReview, PASS/FAIL con findings puntuales) — el
// mismo patrón proponer→revisar de review-candidate.ts pero aplicado a
// evolucionar el propio protocolo en vez de a un cambio de código.
export interface EscalationClassMapping {
  roleId: string;
  sourceClass: string;
  targetClass: string;
  rationale: string;
}

export interface EscalationVocabularyAddition {
  classId: string;
  definition: string;
  distinction: string;
}

export interface EscalationReconciliationProposal {
  workPacketId: string;
  workPacketDigest: string;
  authorSessionId: string;
  vocabularyAdditions: readonly EscalationVocabularyAddition[];
  mappings: readonly EscalationClassMapping[];
}

export interface ReconciliationCheck {
  valid: boolean;
  violations: readonly string[];
  proposalId: string;
  proposalDigest: string;
}

export interface ReconciliationFinding {
  mappingKey: string;
  issue: string;
  requiredCorrection: string;
}

export interface EscalationReconciliationReview {
  proposalId: string;
  proposalDigest: string;
  reviewerSessionId: string;
  verdict: 'PASS' | 'FAIL';
  findings: readonly ReconciliationFinding[];
}

export interface ReconciliationReviewCheck {
  valid: boolean;
  violations: readonly string[];
  reviewId: string;
  reviewDigest: string;
}
