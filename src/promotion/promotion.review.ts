import { and, eq } from 'drizzle-orm';
import { digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { GATEWAY_RUN_STATUS } from '../gateway/gateway.constants.js';
import { gatewayRunState, runSpecs } from '../gateway/schema.constants.js';
import { BUNDLED_ROLE_ID } from '../roles/bundled-profile.constants.js';
import { PROMOTION_ERROR } from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import { parseReviewOutput } from './promotion.parsers.js';
import type {
  CandidateEvidence,
  CandidateIdentity,
  ParsedReviewOutput,
  ValidatedReviewVerdict,
} from './promotion.types.js';

interface CompletedReviewRun {
  readonly inputArtifactId: string | null;
  readonly workDefinitionId: string | null;
  readonly workDefinitionVersion: number | null;
  readonly workDefinitionDigest: string | null;
  readonly adapterSessionId: string;
  readonly outputJson: string;
  readonly outputDigest: string;
}

function completedReviewRun(store: Store, runSpecId: string): CompletedReviewRun {
  const row = store.orm.select({
    roleId: runSpecs.roleId,
    inputArtifactId: runSpecs.inputArtifactId,
    workDefinitionId: runSpecs.workDefinitionId,
    workDefinitionVersion: runSpecs.workDefinitionVersion,
    workDefinitionDigest: runSpecs.workDefinitionDigest,
    adapterSessionId: gatewayRunState.adapterSessionId,
    status: gatewayRunState.status,
    outputJson: gatewayRunState.outputJson,
    outputDigest: gatewayRunState.outputDigest,
  }).from(runSpecs).innerJoin(gatewayRunState, eq(gatewayRunState.runSpecId, runSpecs.id)).where(and(
    eq(runSpecs.id, runSpecId),
    eq(runSpecs.roleId, BUNDLED_ROLE_ID.REVIEWER),
  )).get();
  if (row === undefined || row.status !== GATEWAY_RUN_STATUS.COMPLETED
    || row.outputJson === null || row.outputDigest === null) {
    throw new PromotionError(PROMOTION_ERROR.REVIEW_INVALID, `review run is not completed: ${runSpecId}`);
  }
  return { ...row, outputJson: row.outputJson, outputDigest: row.outputDigest };
}

// Dos garantías separadas: (1) el run del reviewer realmente evaluó ESTE
// candidato (mismo artifact de input, misma work definition — no un
// veredicto reciclado de otro candidato parecido), y (2) el reviewer no
// es la misma sesión que produjo el candidato — SELF_REVIEW. Nunca se
// confía en que el reviewer "diga" que no se autorevisó; se compara la
// identidad de sesión real, persistida por separado para cada rol.
function assertRunBinding(row: CompletedReviewRun, candidate: CandidateIdentity, evidence: CandidateEvidence): void {
  if (row.inputArtifactId !== evidence.artifactId
    || row.workDefinitionId !== candidate.taskId
    || row.workDefinitionVersion !== candidate.workDefinitionVersion
    || row.workDefinitionDigest !== candidate.workDefinitionDigest) {
    throw new PromotionError(PROMOTION_ERROR.REVIEW_INVALID, 'review run is not bound to this candidate definition');
  }
  if (row.adapterSessionId === evidence.producerSessionId) {
    throw new PromotionError(PROMOTION_ERROR.SELF_REVIEW, 'reviewer session matches candidate producer session');
  }
}

// Re-calcula el digest del output guardado y lo compara contra el digest
// que se persistió al completarse el run — detecta si el JSON fue
// editado a mano en la DB después de guardado (o corrupción), antes de
// confiar en su contenido para decidir si promover o no.
function verifiedOutput(row: CompletedReviewRun, candidate: CandidateIdentity): ParsedReviewOutput {
  const parsedValue: unknown = JSON.parse(row.outputJson);
  if (digest(parsedValue) !== row.outputDigest) {
    throw new PromotionError(PROMOTION_ERROR.REVIEW_INVALID, 'review output digest does not match stored output');
  }
  const output = parseReviewOutput(row.outputJson);
  if (output.candidateSha !== candidate.candidateSha
    || output.taskId !== candidate.taskId
    || output.workDefinitionVersion !== candidate.workDefinitionVersion
    || output.workDefinitionDigest !== candidate.workDefinitionDigest) {
    throw new PromotionError(PROMOTION_ERROR.REVIEW_INVALID, 'review output is bound to another candidate');
  }
  return output;
}

export function validateReviewerRun(
  store: Store,
  candidate: CandidateIdentity,
  evidence: CandidateEvidence,
  runSpecId: string,
): ValidatedReviewVerdict {
  const row = completedReviewRun(store, runSpecId);
  assertRunBinding(row, candidate, evidence);
  const output = verifiedOutput(row, candidate);
  return {
    runSpecId,
    reviewerSessionId: row.adapterSessionId,
    outputDigest: row.outputDigest,
    verdict: output.verdict,
    payloadJson: row.outputJson,
  };
}
