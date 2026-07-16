import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';
import { persistProtocolWorkInspection } from './protocol-work.js';
import type {
  EscalationClassMapping,
  EscalationReconciliationProposal,
  EscalationReconciliationReview,
  EscalationVocabularyAddition,
  ReconciliationCheck,
  ReconciliationFinding,
  ReconciliationReviewCheck,
} from './protocol-reconciliation.types.js';
import type { ProtocolWorkPacket } from './protocol-work.types.js';
import {
  BEGIN_IMMEDIATE,
  RECONCILIATION_PROPOSAL_STATUS,
  RECONCILIATION_REVIEW_FIELD,
  RECONCILIATION_REVIEW_LABEL,
  RECONCILIATION_VERDICT,
} from './protocol-reconciliation.constants.js';
import { parseAgentJsonOutput } from './structured-output.js';
import type { StructuredOutputReceipt } from './structured-output.types.js';
import { evolveProtocolVocabulary } from './protocol-evolution.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string, label: string, violations: string[]): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  violations.push(`${label}.${key} is required`);
  return undefined;
}

function parseMapping(value: unknown, index: number, violations: string[]): EscalationClassMapping | undefined {
  const label = `mappings[${index}]`;
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return undefined;
  }
  const roleId = readString(value, 'roleId', label, violations);
  const sourceClass = readString(value, 'sourceClass', label, violations);
  const targetClass = readString(value, 'targetClass', label, violations);
  const rationale = readString(value, 'rationale', label, violations);
  if ([roleId, sourceClass, targetClass, rationale].some((item) => item === undefined)) return undefined;
  if (roleId === undefined || sourceClass === undefined || targetClass === undefined || rationale === undefined) return undefined;
  return { roleId, sourceClass, targetClass, rationale };
}

function parseVocabularyAddition(value: unknown, index: number, violations: string[]): EscalationVocabularyAddition | undefined {
  const label = `vocabularyAdditions[${index}]`;
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return undefined;
  }
  const classId = readString(value, 'classId', label, violations);
  const definition = readString(value, 'definition', label, violations);
  const distinction = readString(value, 'distinction', label, violations);
  if (classId === undefined || definition === undefined || distinction === undefined) return undefined;
  return { classId, definition, distinction };
}

function parseVocabularyAdditions(value: unknown, violations: string[]): EscalationVocabularyAddition[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    violations.push('proposal.vocabularyAdditions must be an array');
    return undefined;
  }
  const additions = value.map((item, index) => parseVocabularyAddition(item, index, violations));
  if (additions.some((addition) => addition === undefined)) return undefined;
  return additions.filter((addition): addition is EscalationVocabularyAddition => addition !== undefined);
}

function parseProposal(value: unknown, violations: string[], runtimeSessionId?: string): EscalationReconciliationProposal | undefined {
  if (!isRecord(value)) {
    violations.push('proposal must be an object');
    return undefined;
  }
  const workPacketId = readString(value, 'workPacketId', 'proposal', violations);
  const workPacketDigest = readString(value, 'workPacketDigest', 'proposal', violations);
  const authorSessionId = runtimeSessionId ?? readString(value, 'authorSessionId', 'proposal', violations);
  const vocabularyAdditions = parseVocabularyAdditions(value.vocabularyAdditions, violations);
  if (!Array.isArray(value.mappings)) {
    violations.push('proposal.mappings must be an array');
    return undefined;
  }
  const mappings = value.mappings.map((item, index) => parseMapping(item, index, violations));
  if (workPacketId === undefined || workPacketDigest === undefined || authorSessionId === undefined || vocabularyAdditions === undefined
    || mappings.some((mapping) => mapping === undefined)) return undefined;
  return {
    workPacketId,
    workPacketDigest,
    authorSessionId,
    vocabularyAdditions,
    mappings: mappings.filter((mapping): mapping is EscalationClassMapping => mapping !== undefined),
  };
}

function mappingKey(roleId: string, classId: string): string {
  return `${roleId}:${classId}`;
}

function coverageViolations(proposal: EscalationReconciliationProposal, packet: ProtocolWorkPacket): string[] {
  const expected = packet.sourceReconciliation.unsupportedEscalations.map(({ roleId, classId }) => mappingKey(roleId, classId));
  const actual = proposal.mappings.map(({ roleId, sourceClass }) => mappingKey(roleId, sourceClass));
  const duplicates = [...new Set(actual.filter((key, index) => actual.indexOf(key) !== index))].sort();
  return [
    ...duplicates.map((key) => `duplicate mapping: ${key}`),
    ...expected.filter((key) => !actual.includes(key)).map((key) => `missing mapping: ${key}`),
    ...actual.filter((key) => !expected.includes(key)).map((key) => `unexpected mapping: ${key}`),
  ];
}

function proposalViolations(proposal: EscalationReconciliationProposal, packet: ProtocolWorkPacket): string[] {
  const violations = coverageViolations(proposal, packet);
  if (proposal.workPacketId !== packet.id) violations.push(`proposal targets ${proposal.workPacketId}, expected ${packet.id}`);
  if (proposal.workPacketDigest !== packet.packetDigest) violations.push('proposal work packet digest does not match');
  const existing = packet.sourceReconciliation.allowedEscalationClasses;
  const additionIds = proposal.vocabularyAdditions.map(({ classId }) => classId);
  const duplicateAdditions = [...new Set(additionIds.filter((id, index) => additionIds.indexOf(id) !== index))];
  violations.push(...duplicateAdditions.map((id) => `duplicate vocabulary addition: ${id}`));
  violations.push(...additionIds.filter((id) => existing.includes(id)).map((id) => `vocabulary addition already exists: ${id}`));
  violations.push(...additionIds.filter((id) => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)).map((id) => `invalid vocabulary class id: ${id}`));
  const allowed = new Set([...existing, ...additionIds]);
  for (const mapping of proposal.mappings.filter(({ targetClass }) => !allowed.has(targetClass))) {
    violations.push(`${mappingKey(mapping.roleId, mapping.sourceClass)}: unsupported target ${mapping.targetClass}`);
  }
  const usedTargets = new Set(proposal.mappings.map(({ targetClass }) => targetClass));
  violations.push(...additionIds.filter((id) => !usedTargets.has(id)).map((id) => `unused vocabulary addition: ${id}`));
  return violations;
}

function preParsedReceipt(value: unknown): StructuredOutputReceipt {
  return { rawOutputDigest: digest(value), normalization: STRUCTURED_OUTPUT_NORMALIZATION.PRE_PARSED };
}

export function evaluateAndPersistReconciliationProposal(
  store: Store,
  value: unknown,
  authorSessionId: string,
  outputReceipt: StructuredOutputReceipt = preParsedReceipt(value),
): ReconciliationCheck {
  const packet = persistProtocolWorkInspection(store).packet;
  const violations: string[] = [];
  const proposal = parseProposal(value, violations, authorSessionId);
  if (proposal !== undefined) violations.push(...proposalViolations(proposal, packet));
  const persistedValue = proposal === undefined ? value : { ...proposal, runtimeOutputReceipt: outputReceipt };
  const proposalDigest = digest(persistedValue);
  const proposalId = `protocol-reconciliation-${proposalDigest.slice(0, 16)}`;
  const now = new Date().toISOString();
  store.db.prepare(`INSERT OR IGNORE INTO protocol_reconciliation_proposals
    (id, work_packet_id, proposal_json, proposal_digest, valid, violations_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'evaluated', ?, ?)`)
    .run(proposalId, packet.id, canonicalJson(persistedValue), proposalDigest, violations.length === 0 ? 1 : 0,
      canonicalJson(violations), now, now);
  return { valid: violations.length === 0, violations, proposalId, proposalDigest };
}

export function ingestReconciliationProposalOutput(store: Store, raw: string, authorSessionId: string): ReconciliationCheck {
  const parsed = parseAgentJsonOutput(raw);
  return evaluateAndPersistReconciliationProposal(store, parsed.value, authorSessionId, parsed.receipt);
}

function parseFinding(value: unknown, index: number, violations: string[]): ReconciliationFinding | undefined {
  const label = `findings[${index}]`;
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return undefined;
  }
  const mapping = readString(value, 'mappingKey', label, violations);
  const issue = readString(value, 'issue', label, violations);
  const correction = readString(value, 'requiredCorrection', label, violations);
  if (mapping === undefined || issue === undefined || correction === undefined) return undefined;
  return { mappingKey: mapping, issue, requiredCorrection: correction };
}

function parseVerdict(value: unknown, violations: string[]): 'PASS' | 'FAIL' | undefined {
  if (value === RECONCILIATION_VERDICT.PASS || value === RECONCILIATION_VERDICT.FAIL) return value;
  violations.push('review.verdict must be PASS or FAIL');
  return undefined;
}

function parseFindings(value: unknown, violations: string[]): ReconciliationFinding[] | undefined {
  if (!Array.isArray(value)) {
    violations.push('review.findings must be an array');
    return undefined;
  }
  const findings = value.map((item, index) => parseFinding(item, index, violations));
  if (findings.some((finding) => finding === undefined)) return undefined;
  return findings.filter((finding): finding is ReconciliationFinding => finding !== undefined);
}

function parseReview(value: unknown, violations: string[], runtimeSessionId?: string): EscalationReconciliationReview | undefined {
  if (!isRecord(value)) {
    violations.push('review must be an object');
    return undefined;
  }
  const proposalId = readString(value, RECONCILIATION_REVIEW_FIELD.PROPOSAL_ID, RECONCILIATION_REVIEW_LABEL, violations);
  const proposalDigest = readString(value, RECONCILIATION_REVIEW_FIELD.PROPOSAL_DIGEST, RECONCILIATION_REVIEW_LABEL, violations);
  const reviewerSessionId = runtimeSessionId
    ?? readString(value, RECONCILIATION_REVIEW_FIELD.REVIEWER_SESSION_ID, RECONCILIATION_REVIEW_LABEL, violations);
  const verdict = parseVerdict(value.verdict, violations);
  const findings = parseFindings(value.findings, violations);
  if (proposalId === undefined || proposalDigest === undefined || reviewerSessionId === undefined || verdict === undefined
    || findings === undefined) return undefined;
  return { proposalId, proposalDigest, reviewerSessionId, verdict, findings };
}

function findingReferenceViolations(
  proposal: EscalationReconciliationProposal,
  review: EscalationReconciliationReview,
): string[] {
  const violations: string[] = [];
  if (proposal.authorSessionId === review.reviewerSessionId) violations.push('reviewer session must be independent from author session');
  const allowedKeys = [
    ...proposal.mappings.map(({ roleId, sourceClass }) => mappingKey(roleId, sourceClass)),
    ...proposal.vocabularyAdditions.map(({ classId }) => `vocabulary:${classId}`),
  ];
  const findingKeys = review.findings.map(({ mappingKey: key }) => key);
  const duplicates = [...new Set(findingKeys.filter((value, index) => findingKeys.indexOf(value) !== index))];
  violations.push(...duplicates.map((key) => `duplicate review finding: ${key}`));
  violations.push(...findingKeys.filter((value) => !allowedKeys.includes(value)).map((key) => `unknown review mapping key: ${key}`));
  return violations;
}

function storedProposalViolations(row: unknown, review: EscalationReconciliationReview): string[] {
  const violations: string[] = [];
  if (stringColumn(row, 'proposal_digest') !== review.proposalDigest) violations.push('review proposal digest does not match');
  if (numberColumn(row, 'valid') !== 1) violations.push('review cannot approve a mechanically invalid proposal');
  if (stringColumn(row, 'status') !== RECONCILIATION_PROPOSAL_STATUS.EVALUATED) violations.push('proposal already has a terminal review');
  const proposalValue: unknown = JSON.parse(stringColumn(row, 'proposal_json'));
  const parseViolations: string[] = [];
  const proposal = parseProposal(proposalValue, parseViolations);
  if (proposal === undefined) violations.push('stored proposal cannot be parsed');
  else violations.push(...findingReferenceViolations(proposal, review));
  return violations;
}

function reviewViolations(store: Store, review: EscalationReconciliationReview): string[] {
  const row = store.db.prepare(`SELECT proposal_digest, proposal_json, valid, status FROM protocol_reconciliation_proposals
    WHERE id = ?`).get(review.proposalId);
  if (row === undefined) return [`unknown proposal: ${review.proposalId}`];
  const violations = storedProposalViolations(row, review);
  if (review.verdict === RECONCILIATION_VERDICT.PASS && review.findings.length > 0) violations.push('PASS review cannot contain findings');
  if (review.verdict === RECONCILIATION_VERDICT.FAIL && review.findings.length === 0) violations.push('FAIL review must contain findings');
  return violations;
}

export function evaluateAndPersistReconciliationReview(
  store: Store,
  value: unknown,
  reviewerSessionId: string,
  outputReceipt: StructuredOutputReceipt = preParsedReceipt(value),
): ReconciliationReviewCheck {
  const violations: string[] = [];
  const review = parseReview(value, violations, reviewerSessionId);
  if (review !== undefined) violations.push(...reviewViolations(store, review));
  const persistedValue = review === undefined ? value : { ...review, runtimeOutputReceipt: outputReceipt };
  const reviewDigest = digest(persistedValue);
  const reviewId = `protocol-reconciliation-review-${reviewDigest.slice(0, 16)}`;
  if (review !== undefined && violations.length === 0) {
    const now = new Date().toISOString();
    store.db.exec(BEGIN_IMMEDIATE);
    try {
      store.db.prepare(`INSERT OR IGNORE INTO protocol_reconciliation_reviews
        (id, proposal_id, review_json, review_digest, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(reviewId, review.proposalId, canonicalJson(persistedValue), reviewDigest, review.verdict, now);
      store.db.prepare(`UPDATE protocol_reconciliation_proposals SET status = ?, updated_at = ? WHERE id = ?`)
        .run(review.verdict === RECONCILIATION_VERDICT.PASS
          ? RECONCILIATION_PROPOSAL_STATUS.APPROVED
          : RECONCILIATION_PROPOSAL_STATUS.REJECTED, now, review.proposalId);
      store.db.exec('COMMIT');
    } catch (error: unknown) {
      store.db.exec('ROLLBACK');
      throw error;
    }
  }
  return { valid: violations.length === 0, violations, reviewId, reviewDigest };
}

export function ingestReconciliationReviewOutput(store: Store, raw: string, reviewerSessionId: string): ReconciliationReviewCheck {
  const parsed = parseAgentJsonOutput(raw);
  return evaluateAndPersistReconciliationReview(store, parsed.value, reviewerSessionId, parsed.receipt);
}

export function applyApprovedReconciliation(store: Store, proposalId: string): void {
  const row = store.db.prepare(`SELECT proposal_json, status FROM protocol_reconciliation_proposals WHERE id = ?`).get(proposalId);
  if (row === undefined) throw new ContextError('UNKNOWN_RECONCILIATION', `unknown reconciliation proposal: ${proposalId}`);
  if (stringColumn(row, 'status') !== RECONCILIATION_PROPOSAL_STATUS.APPROVED) {
    throw new ContextError('UNAPPROVED_RECONCILIATION', `${proposalId} is not approved`);
  }
  const value: unknown = JSON.parse(stringColumn(row, 'proposal_json'));
  const violations: string[] = [];
  const proposal = parseProposal(value, violations);
  if (proposal === undefined) throw new ContextError('INVALID_RECONCILIATION', violations.join('; '));
  const now = new Date().toISOString();
  store.db.exec(BEGIN_IMMEDIATE);
  try {
    evolveProtocolVocabulary(store, proposal.vocabularyAdditions);
    for (const mapping of proposal.mappings) {
      store.db.prepare('DELETE FROM role_escalation_classes WHERE role_id = ? AND class_id = ?')
        .run(mapping.roleId, mapping.sourceClass);
      store.db.prepare('INSERT OR IGNORE INTO role_escalation_classes (role_id, class_id) VALUES (?, ?)')
        .run(mapping.roleId, mapping.targetClass);
    }
    store.db.prepare(`UPDATE protocol_reconciliation_proposals SET status = 'applied', updated_at = ? WHERE id = ?`)
      .run(now, proposalId);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
