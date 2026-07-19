import { digest } from '../context/digest.js';
import { loadConfig } from '../config.js';
import { openStore } from '../db/store.js';
import type { Store } from '../db/store.types.js';
import { EMPTY_SIZE } from '../platform.constants.js';
import { runCleanVerification } from '../review/preflight-clean-verification.js';
import { PREFLIGHT_STATUS, type CleanVerificationReceipt } from '../review/preflight.types.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { overlaps } from '../tasks/write-set.js';
import { DEFAULT_GIT_BRANCH } from '../db/store.constants.js';
import {
  PROMOTION_CHECK,
  PROMOTION_CHECK_STATUS,
  PROMOTION_CONTROLLER_VERSION,
  PROMOTION_ERROR,
  PROMOTION_STATUS,
  PROMOTION_TRIGGER,
  PROMOTION_VERDICT,
} from './promotion.constants.js';
import { PromotionError } from './promotion.errors.js';
import { createLocalGitPromotionPort } from './promotion.git.js';
import { integrateCandidate } from './promotion.integration.js';
import { closePromotedTask, findPromotionReceipt } from './promotion.receipts.js';
import {
  candidateStatus,
  ensurePromotionCandidate,
  loadCandidateEvidence,
  recordCheckReceipt,
  recordValidatedVerdict,
  transitionCandidate,
} from './promotion.repository.js';
import { validateReviewerRun } from './promotion.review.js';
import type {
  CandidateEvidence,
  CandidateIdentity,
  GitPromotionPort,
  PromotionReceipt,
  PromotionRequest,
  ValidatedReviewVerdict,
} from './promotion.types.js';

type CleanVerificationRunner = (sourceWorktree: string) => Promise<CleanVerificationReceipt>;

interface PromotionControllerDependencies {
  readonly git: GitPromotionPort;
  readonly verifyClean: CleanVerificationRunner;
}

const DEFAULT_DEPENDENCIES: PromotionControllerDependencies = {
  git: createLocalGitPromotionPort(),
  verifyClean: runCleanVerification,
};

function assertReviewCandidateEvidence(evidence: CandidateEvidence): void {
  if (evidence.preflightOverall !== PREFLIGHT_STATUS.PASS
    || evidence.cleanVerificationStatus !== PREFLIGHT_STATUS.PASS
    || evidence.cleanVerificationCandidateSha !== evidence.identity.candidateSha) {
    throw new PromotionError(
      PROMOTION_ERROR.CANDIDATE_INVALID,
      'review candidate does not contain a passing clean verification bound to its SHA',
    );
  }
}

function assertWorkDefinition(store: Store, evidence: CandidateEvidence): void {
  const current = loadWorkDefinition(store, evidence.identity.taskId);
  if (current.version !== evidence.identity.workDefinitionVersion
    || current.digest !== evidence.identity.workDefinitionDigest) {
    throw new PromotionError(PROMOTION_ERROR.CANDIDATE_STALE, 'work definition changed after candidate creation');
  }
  const writeSet = current.value.writeSet;
  const violations = evidence.changedFiles.filter((file) => !writeSet.some((pattern) => overlaps(pattern, file)));
  if (violations.length > EMPTY_SIZE) {
    throw new PromotionError(
      PROMOTION_ERROR.CHECK_FAILED,
      `candidate contains files outside its write set: ${violations.join(', ')}`,
    );
  }
}

function controllerDigest(repoRoot: string): string {
  return digest({
    version: PROMOTION_CONTROLLER_VERSION,
    configuration: loadConfig(repoRoot),
  });
}

function contractDigest(evidence: CandidateEvidence): string {
  return digest({
    version: PROMOTION_CONTROLLER_VERSION,
    workDefinitionDigest: evidence.identity.workDefinitionDigest,
    reviewCandidateArtifactDigest: evidence.artifactDigest,
  });
}

function assertCurrentIdentity(
  store: Store,
  repoRoot: string,
  candidate: CandidateIdentity,
  evidence: CandidateEvidence,
): void {
  assertWorkDefinition(store, evidence);
  const currentConfigDigest = digest(loadConfig(repoRoot));
  if (candidate.configDigest !== currentConfigDigest || candidate.contractDigest !== contractDigest(evidence)) {
    throw new PromotionError(PROMOTION_ERROR.CANDIDATE_STALE, 'candidate configuration or contract changed');
  }
}

export class PromotionController {
  private readonly dependencies: PromotionControllerDependencies;
  private store: Store;

  constructor(
    store: Store,
    private readonly repoRoot: string,
    dependencyOverrides: Partial<PromotionControllerDependencies> = {},
  ) {
    this.store = store;
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  }

  /**
   * Returns the currently-bound store. Callers must treat it as read-only
   * unless they are tests managing fixture lifecycle.
   */
  getStore(): Store {
    return this.store;
  }

  async promote(request: PromotionRequest): Promise<PromotionReceipt> {
    const targetRef = request.targetRef ?? DEFAULT_GIT_BRANCH.MAIN;
    const evidence = loadCandidateEvidence(this.store, request.reviewCandidateId);
    assertReviewCandidateEvidence(evidence);
    assertWorkDefinition(this.store, evidence);
    const runtimeDigest = controllerDigest(this.repoRoot);
    const candidate = ensurePromotionCandidate(this.store, evidence, {
      reviewCandidateId: request.reviewCandidateId,
      configDigest: digest(loadConfig(this.repoRoot)),
      contractDigest: contractDigest(evidence),
    }, runtimeDigest);
    const completed = findPromotionReceipt(this.store, candidate.id);
    if (completed !== undefined) return completed;
    assertCurrentIdentity(this.store, this.repoRoot, candidate, evidence);

    const verdict = validateReviewerRun(this.store, candidate, evidence, request.reviewerRunSpecId);
    this.advanceThroughChecks(candidate, evidence, verdict, runtimeDigest);
    const verificationDigest = await this.verifyImmediatelyBeforeIntegration(candidate);
    const resultSha = integrateCandidate(
      this.store,
      this.dependencies.git,
      this.repoRoot,
      candidate,
      targetRef,
      runtimeDigest,
    );
    return closePromotedTask(
      this.store,
      candidate,
      targetRef,
      resultSha,
      evidence.integration,
      verdict.runSpecId,
      verificationDigest,
      runtimeDigest,
    );
  }

  private advanceThroughChecks(
    candidate: CandidateIdentity,
    evidence: CandidateEvidence,
    verdict: ValidatedReviewVerdict,
    runtimeDigest: string,
  ): void {
    const current = candidateStatus(this.store, candidate.id);
    if (current === PROMOTION_STATUS.CREATED) {
      const writeSetReceipt = { changedFiles: evidence.changedFiles, workDefinitionDigest: candidate.workDefinitionDigest };
      recordCheckReceipt(
        this.store,
        candidate.id,
        PROMOTION_CHECK.WRITE_SET,
        PROMOTION_CHECK_STATUS.PASS,
        candidate.candidateSha,
        writeSetReceipt,
      );
      transitionCandidate(
        this.store,
        candidate.id,
        PROMOTION_STATUS.CREATED,
        PROMOTION_STATUS.CHECKS_COMPLETED,
        PROMOTION_TRIGGER.CHECKS_PASSED,
        runtimeDigest,
      );
    }
    const afterChecks = candidateStatus(this.store, candidate.id);
    if (afterChecks === PROMOTION_STATUS.CHECKS_COMPLETED) {
      recordValidatedVerdict(this.store, candidate, verdict);
      if (verdict.verdict === PROMOTION_VERDICT.REQUEST_CHANGES) {
        transitionCandidate(
          this.store,
          candidate.id,
          PROMOTION_STATUS.CHECKS_COMPLETED,
          PROMOTION_STATUS.REJECTED,
          PROMOTION_TRIGGER.REVIEW_REJECTED,
          runtimeDigest,
        );
        throw new PromotionError(PROMOTION_ERROR.REVIEW_REJECTED, 'reviewer requested changes');
      }
      transitionCandidate(
        this.store,
        candidate.id,
        PROMOTION_STATUS.CHECKS_COMPLETED,
        PROMOTION_STATUS.APPROVED,
        PROMOTION_TRIGGER.REVIEW_APPROVED,
        runtimeDigest,
      );
    }
    const final = candidateStatus(this.store, candidate.id);
    if (final === PROMOTION_STATUS.REJECTED || final === PROMOTION_STATUS.BLOCKED) {
      throw new PromotionError(PROMOTION_ERROR.INVALID_STATE, `candidate cannot continue from ${final}`);
    }
  }

  private async verifyImmediatelyBeforeIntegration(candidate: CandidateIdentity): Promise<string> {
    if (this.dependencies.git.headSha(this.repoRoot) !== candidate.candidateSha) {
      throw new PromotionError(PROMOTION_ERROR.CANDIDATE_STALE, 'current worktree HEAD is not the candidate SHA');
    }
    // The clean verification spawns a separate git worktree and runs the
    // project verify command there. On Windows, keeping the primary store
    // connection open while another process initializes the worktree store
    // can produce SQLITE_BUSY / "database is locked" errors, so we close and
    // reopen around the preflight.
    const previousStore = this.store;
    previousStore.close();
    let cleanReceipt: CleanVerificationReceipt;
    try {
      cleanReceipt = await this.dependencies.verifyClean(this.repoRoot);
    } finally {
      this.store = openStore(this.repoRoot);
    }
    if (cleanReceipt.status !== PREFLIGHT_STATUS.PASS || cleanReceipt.candidateSha !== candidate.candidateSha) {
      recordCheckReceipt(
        this.store,
        candidate.id,
        PROMOTION_CHECK.CLEAN_VERIFICATION,
        PROMOTION_CHECK_STATUS.FAIL,
        candidate.candidateSha,
        cleanReceipt,
      );
      throw new PromotionError(PROMOTION_ERROR.CHECK_FAILED, 'clean candidate verification did not pass');
    }
    return recordCheckReceipt(
      this.store,
      candidate.id,
      PROMOTION_CHECK.CLEAN_VERIFICATION,
      PROMOTION_CHECK_STATUS.PASS,
      candidate.candidateSha,
      cleanReceipt,
    );
  }
}
