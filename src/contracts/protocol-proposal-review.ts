import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { ARTIFACT_CONTRACT_STATUS } from './artifact.constants.js';
import { addArtifactContract } from './artifacts.js';
import { checkProtocolProposal } from './protocol-proposal.js';
import { parseAgentJsonOutput } from './structured-output.js';
import type { StructuredOutputReceipt } from './structured-output.types.js';
import type {
  ProtocolProposalFinding,
  ProtocolProposalReview,
  ProtocolProposalReviewEvaluation,
} from './protocol-proposal-review.types.js';
import {
  INVALID_STORED_PROPOSAL,
  PROTOCOL_PROPOSAL_REVIEW_FIELD,
  PROTOCOL_PROPOSAL_REVIEW_LABEL,
  PROTOCOL_PROPOSAL_REVIEW_VERDICT,
  PROTOCOL_PROPOSAL_STATUS,
  UPDATE_PROTOCOL_PROPOSAL_STATUS_SQL,
} from './protocol-proposal-review.constants.js';

type JsonRecord = Record<string, unknown>;
const BEGIN_IMMEDIATE = 'BEGIN IMMEDIATE';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string, label: string, violations: string[]): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  violations.push(`${label}.${key} is required`);
  return undefined;
}

function parseFinding(value: unknown, index: number, violations: string[]): ProtocolProposalFinding | undefined {
  const label = `findings[${index}]`;
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return undefined;
  }
  const contractRef = readString(value, 'contractRef', label, violations);
  const issue = readString(value, 'issue', label, violations);
  const requiredCorrection = readString(value, 'requiredCorrection', label, violations);
  if (contractRef === undefined || issue === undefined || requiredCorrection === undefined) return undefined;
  return { contractRef, issue, requiredCorrection };
}

function parseReview(value: unknown, reviewerSessionId: string, violations: string[]): ProtocolProposalReview | undefined {
  if (!isRecord(value)) {
    violations.push('review must be an object');
    return undefined;
  }
  const proposalId = readString(value, PROTOCOL_PROPOSAL_REVIEW_FIELD.PROPOSAL_ID, PROTOCOL_PROPOSAL_REVIEW_LABEL, violations);
  const proposalDigest = readString(value, PROTOCOL_PROPOSAL_REVIEW_FIELD.PROPOSAL_DIGEST, PROTOCOL_PROPOSAL_REVIEW_LABEL, violations);
  const verdictValue = value.verdict;
  const verdict = verdictValue === PROTOCOL_PROPOSAL_REVIEW_VERDICT.PASS
    || verdictValue === PROTOCOL_PROPOSAL_REVIEW_VERDICT.FAIL ? verdictValue : undefined;
  if (verdict === undefined) violations.push('review.verdict must be PASS or FAIL');
  if (!Array.isArray(value.findings)) {
    violations.push('review.findings must be an array');
    return undefined;
  }
  const findings = value.findings.map((item, index) => parseFinding(item, index, violations));
  if (proposalId === undefined || proposalDigest === undefined || verdict === undefined
    || findings.some((finding) => finding === undefined)) return undefined;
  return {
    proposalId,
    proposalDigest,
    reviewerSessionId,
    verdict,
    findings: findings.filter((finding): finding is ProtocolProposalFinding => finding !== undefined),
  };
}

function proposalContractRefs(value: JsonRecord): string[] {
  if (!Array.isArray(value.contracts)) return [];
  return value.contracts.filter((contract): contract is JsonRecord => isRecord(contract))
    .map((contract) => contract.ref)
    .filter((ref): ref is string => typeof ref === 'string');
}

function proposalAuthorSessions(value: JsonRecord): string[] {
  if (Array.isArray(value.authorSessionIds)) {
    return value.authorSessionIds.filter((sessionId): sessionId is string => typeof sessionId === 'string');
  }
  return typeof value.authorSessionId === 'string' ? [value.authorSessionId] : [];
}

// "El reviewer debe ser independiente del autor" (línea con
// authorSessionIds.includes) es la mecanización de HJ-004: reviewer no
// aprueba su propio trabajo — no es una convención de proceso, es un
// chequeo que bloquea la escritura si coincide la sesión. valid !== 1 y
// status !== EVALUATED son las otras dos puertas: no se puede revisar una
// propuesta mecánicamente inválida, ni una que ya tuvo un veredicto
// terminal — sólo hay una revisión real por propuesta.
function relationshipViolations(row: unknown, review: ProtocolProposalReview): string[] {
  const violations: string[] = [];
  if (stringColumn(row, 'proposal_digest') !== review.proposalDigest) violations.push('review proposal digest does not match');
  if (numberColumn(row, 'valid') !== 1) violations.push('review cannot accept a mechanically invalid proposal');
  if (stringColumn(row, 'status') !== PROTOCOL_PROPOSAL_STATUS.EVALUATED) violations.push('proposal already has a terminal review');
  const value: unknown = JSON.parse(stringColumn(row, 'proposal_json'));
  if (!isRecord(value)) return [...violations, INVALID_STORED_PROPOSAL];
  if (proposalAuthorSessions(value).includes(review.reviewerSessionId)) {
    violations.push('reviewer session must be independent from author session');
  }
  const allowedRefs = proposalContractRefs(value);
  const findingRefs = review.findings.map(({ contractRef }) => contractRef);
  const findingKeys = review.findings.map((finding) => canonicalJson(finding));
  const duplicateIndexes = findingKeys
    .map((key, index) => findingKeys.indexOf(key) === index ? -1 : index)
    .filter((index) => index >= 0);
  violations.push(...duplicateIndexes.map((index) => `duplicate review finding: ${findingRefs[index] ?? '<missing-ref>'}`));
  violations.push(...findingRefs.filter((ref) => !allowedRefs.includes(ref)).map((ref) => `unknown review contract ref: ${ref}`));
  if (review.verdict === PROTOCOL_PROPOSAL_REVIEW_VERDICT.PASS && review.findings.length > 0) violations.push('PASS review cannot contain findings');
  if (review.verdict === PROTOCOL_PROPOSAL_REVIEW_VERDICT.FAIL && review.findings.length === 0) violations.push('FAIL review must contain findings');
  return violations;
}

function persistedReview(review: ProtocolProposalReview | undefined, value: unknown, receipt: StructuredOutputReceipt): unknown {
  return review === undefined ? value : { ...review, runtimeOutputReceipt: receipt };
}

function persistAcceptedReview(
  store: Store,
  review: ProtocolProposalReview,
  persisted: unknown,
  reviewId: string,
  reviewDigest: string,
): void {
  const status = review.verdict === PROTOCOL_PROPOSAL_REVIEW_VERDICT.PASS
    ? PROTOCOL_PROPOSAL_STATUS.APPROVED : PROTOCOL_PROPOSAL_STATUS.REJECTED;
  store.db.exec(BEGIN_IMMEDIATE);
  try {
    store.db.prepare(`INSERT INTO protocol_proposal_reviews
      (id, proposal_id, review_json, review_digest, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(reviewId, review.proposalId, canonicalJson(persisted), reviewDigest, review.verdict, new Date().toISOString());
    store.db.prepare(UPDATE_PROTOCOL_PROPOSAL_STATUS_SQL).run(status, review.proposalId);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

function evaluateReview(store: Store, value: unknown, reviewerSessionId: string, receipt: StructuredOutputReceipt): ProtocolProposalReviewEvaluation {
  const violations: string[] = [];
  const review = parseReview(value, reviewerSessionId, violations);
  if (review !== undefined) {
    const row = store.db.prepare(`SELECT proposal_json, proposal_digest, valid, status FROM protocol_proposals WHERE id = ?`).get(review.proposalId);
    if (row === undefined) violations.push(`unknown proposal: ${review.proposalId}`);
    else violations.push(...relationshipViolations(row, review));
  }
  const persisted = persistedReview(review, value, receipt);
  const reviewDigest = digest(persisted);
  const reviewId = `protocol-proposal-review-${reviewDigest.slice(0, 16)}`;
  if (review !== undefined && violations.length === 0) persistAcceptedReview(store, review, persisted, reviewId, reviewDigest);
  return { valid: violations.length === 0, violations, reviewId, reviewDigest };
}

export function ingestProtocolProposalReviewOutput(store: Store, raw: string, reviewerSessionId: string): ProtocolProposalReviewEvaluation {
  const parsed = parseAgentJsonOutput(raw);
  return evaluateReview(store, parsed.value, reviewerSessionId, parsed.receipt);
}

function proposalFragment(value: JsonRecord, ref: string): unknown {
  if (!Array.isArray(value.contracts)) return undefined;
  return value.contracts.find((contract) => isRecord(contract) && contract.ref === ref);
}

export function activateApprovedProtocolProposal(store: Store, proposalId: string): void {
  const row = store.db.prepare('SELECT proposal_json, status FROM protocol_proposals WHERE id = ?').get(proposalId);
  if (row === undefined) throw new ContextError('UNKNOWN_PROTOCOL_PROPOSAL', `unknown protocol proposal: ${proposalId}`);
  if (stringColumn(row, 'status') !== PROTOCOL_PROPOSAL_STATUS.APPROVED) throw new ContextError('UNAPPROVED_PROTOCOL_PROPOSAL', `${proposalId} is not approved`);
  const value: unknown = JSON.parse(stringColumn(row, 'proposal_json'));
  if (!isRecord(value)) throw new ContextError('INVALID_PROTOCOL_PROPOSAL', INVALID_STORED_PROPOSAL);
  const result = checkProtocolProposal(store, value);
  if (!result.valid) throw new ContextError('STALE_PROTOCOL_PROPOSAL', result.violations.join('; '));
  const now = new Date().toISOString();
  store.db.exec(BEGIN_IMMEDIATE);
  try {
    for (const [ref, schema] of Object.entries(result.generatedContracts)) {
      addArtifactContract(store, { ref, schema, status: ARTIFACT_CONTRACT_STATUS.ACTIVE });
      store.db.prepare(`INSERT INTO artifact_contract_activations
        (contract_ref, proposal_id, fragment_digest, activated_at) VALUES (?, ?, ?, ?)`)
        .run(ref, proposalId, digest(proposalFragment(value, ref)), now);
    }
    store.db.prepare(UPDATE_PROTOCOL_PROPOSAL_STATUS_SQL).run(PROTOCOL_PROPOSAL_STATUS.APPLIED, proposalId);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
