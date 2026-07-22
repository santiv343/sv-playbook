import { SELF_CORRECTION_MODE } from './role.constants.js';
import type { BundledRoleDefinition, BundledRoleProfile } from './bundled-profile.types.js';

// Este es el catálogo de roles DEFAULT que se bootstrapea en un store
// virgen — y es también la implementación literal de la cadena de autoridad
// de HJ-004 (CLAUDE.md): human -> human-interface -> planner/refuter ->
// delivery-orchestrator -> implementer/reviewer, con advisor/arbiter/
// investigator como roles auxiliares. COMMON_POLICY (más abajo) es la
// mecanización de HJ-004 "missing authority... no role improvises around
// it": todo rol comparte el mismo stopCondition 'authority-or-contract-gap'
// y la misma escalationClass 'authority-gap' — un gap de autoridad nunca se
// resuelve con criterio propio del rol, siempre escala.
export const BUNDLED_ROLE_PROFILE_ID = 'local-general-v1';
export const BUNDLED_ROLE_BOOTSTRAP_KEY = 'bundled-role-profile';
export const BUNDLED_ROLE_CONTEXT_VERSION = 1;
export const BUNDLED_ROLE_CONTEXT_KIND = 'role';
export const BUNDLED_ROLE_CONTEXT_PRECEDENCE_INITIAL_RANK = 1;
export const BUNDLED_ROLE_CONTEXT_PRECEDENCE_STEP = 1;
export const BUNDLED_ROLE_CONTEXT_ID_PREFIX = 'ROLE-BUNDLED-';
export const BUNDLED_ROLE_ARTIFACT_CONTRACT_REF = 'semantic-work-envelope-v1';
export const BUNDLED_ROLE_MODEL_CAPABILITY_ID = 'general-semantic-reasoning';
export const BUNDLED_REVIEW_RESPONSIBILITY_ID = 'review.candidate-judgment';

export const BUNDLED_ROLE_BOOTSTRAP_MODE = {
  EMPTY: 'empty',
  RECONCILE: 'reconcile',
  RESUME: 'resume',
} as const;

export const BUNDLED_ROLE_ID = {
  HUMAN_INTERFACE: 'human-interface',
  ADVISOR: 'advisor',
  PLANNER: 'planner',
  REFUTER: 'refuter',
  ARBITER: 'arbiter',
  DELIVERY_ORCHESTRATOR: 'delivery-orchestrator',
  INVESTIGATOR: 'investigator',
  IMPLEMENTER: 'implementer',
  REVIEWER: 'reviewer',
} as const;

const CAPABILITY_CLASS = {
  ARTIFACT_READ: 'artifact.read',
  WORKSPACE_READ: 'workspace.read',
  COMMAND_REQUEST: 'command.request',
} as const;

const PROHIBITED_EFFECT = {
  CANDIDATE_MODIFY: 'candidate.modify',
  PLAN_APPROVE: 'plan.approve',
  PROMOTION_EXECUTE: 'promotion.execute',
} as const;

const COMMON_POLICY = {
  selfCorrectionMode: SELF_CORRECTION_MODE.BOUNDED,
  selfCorrectionScopes: [BUNDLED_ROLE_ARTIFACT_CONTRACT_REF],
  stopConditions: ['authority-or-contract-gap'],
  escalationClasses: ['authority-gap'],
} as const;

function role(
  id: string,
  mission: string,
  exclusiveJudgment: string,
  capabilityRequestClasses: readonly string[],
  prohibitions: readonly string[],
): BundledRoleDefinition {
  return {
    id,
    mission,
    exclusiveJudgment,
    capabilityRequestClasses,
    policy: { ...COMMON_POLICY, prohibitions },
  };
}

const ROLES = [
  role(BUNDLED_ROLE_ID.HUMAN_INTERFACE, 'Clarify human intent and expose irreducible product decisions.',
    'intent.clarification', ['intent.query', 'work.change.request'], ['delivery.perform', PROHIBITED_EFFECT.CANDIDATE_MODIFY]),
  role(BUNDLED_ROLE_ID.ADVISOR, 'Evaluate a bounded specialist question without taking decision authority.',
    'advice.specialist-evaluation', [CAPABILITY_CLASS.ARTIFACT_READ, 'research.request'], ['decision.commit', PROHIBITED_EFFECT.CANDIDATE_MODIFY]),
  role(BUNDLED_ROLE_ID.PLANNER, 'Turn approved intent into a coherent delivery proposal with acceptance boundaries.',
    'planning.delivery-proposal', [CAPABILITY_CLASS.ARTIFACT_READ, 'plan.propose'], [PROHIBITED_EFFECT.PLAN_APPROVE, 'delivery.dispatch']),
  role(BUNDLED_ROLE_ID.REFUTER, 'Find material flaws in a proposal before work is committed.',
    'refutation.plan-challenge', [CAPABILITY_CLASS.ARTIFACT_READ, 'refutation.propose'], ['plan.modify', PROHIBITED_EFFECT.PLAN_APPROVE]),
  role(BUNDLED_ROLE_ID.ARBITER, 'Resolve a bounded disagreement using declared authority and evidence.',
    'arbitration.disagreement-resolution', [CAPABILITY_CLASS.ARTIFACT_READ, 'decision.propose'], ['authority.expand', PROHIBITED_EFFECT.CANDIDATE_MODIFY]),
  role(BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR, 'Choose bounded delivery recovery while runtime owns execution effects.',
    'delivery.recovery-choice', ['delivery.query', 'dispatch.request'], [PROHIBITED_EFFECT.CANDIDATE_MODIFY, PROHIBITED_EFFECT.PROMOTION_EXECUTE]),
  role(BUNDLED_ROLE_ID.INVESTIGATOR, 'Produce a causal diagnosis and reproducible evidence without changing the candidate.',
    'investigation.causal-diagnosis', [CAPABILITY_CLASS.WORKSPACE_READ, CAPABILITY_CLASS.COMMAND_REQUEST],
    [PROHIBITED_EFFECT.CANDIDATE_MODIFY, PROHIBITED_EFFECT.PROMOTION_EXECUTE]),
  role(BUNDLED_ROLE_ID.IMPLEMENTER, 'Materialize one bounded candidate that satisfies the approved work definition.',
    'implementation.candidate-change', [CAPABILITY_CLASS.WORKSPACE_READ, 'workspace.write', CAPABILITY_CLASS.COMMAND_REQUEST],
    ['acceptance.change', 'candidate.approve']),
  role(BUNDLED_ROLE_ID.REVIEWER, 'Independently judge a candidate and its evidence against approved acceptance.',
    BUNDLED_REVIEW_RESPONSIBILITY_ID, [CAPABILITY_CLASS.ARTIFACT_READ, 'verification.request'],
    [PROHIBITED_EFFECT.CANDIDATE_MODIFY, PROHIBITED_EFFECT.PROMOTION_EXECUTE]),
] as const;

const HANDOFFS = [
  { sourceRoleId: BUNDLED_ROLE_ID.HUMAN_INTERFACE, targetRoleId: BUNDLED_ROLE_ID.ADVISOR },
  { sourceRoleId: BUNDLED_ROLE_ID.HUMAN_INTERFACE, targetRoleId: BUNDLED_ROLE_ID.PLANNER },
  { sourceRoleId: BUNDLED_ROLE_ID.ADVISOR, targetRoleId: BUNDLED_ROLE_ID.HUMAN_INTERFACE },
  { sourceRoleId: BUNDLED_ROLE_ID.PLANNER, targetRoleId: BUNDLED_ROLE_ID.REFUTER },
  { sourceRoleId: BUNDLED_ROLE_ID.REFUTER, targetRoleId: BUNDLED_ROLE_ID.PLANNER },
  { sourceRoleId: BUNDLED_ROLE_ID.REFUTER, targetRoleId: BUNDLED_ROLE_ID.ARBITER },
  { sourceRoleId: BUNDLED_ROLE_ID.ARBITER, targetRoleId: BUNDLED_ROLE_ID.PLANNER },
  { sourceRoleId: BUNDLED_ROLE_ID.ARBITER, targetRoleId: BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR },
  { sourceRoleId: BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR, targetRoleId: BUNDLED_ROLE_ID.INVESTIGATOR },
  { sourceRoleId: BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR, targetRoleId: BUNDLED_ROLE_ID.IMPLEMENTER },
  { sourceRoleId: BUNDLED_ROLE_ID.INVESTIGATOR, targetRoleId: BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR },
  { sourceRoleId: BUNDLED_ROLE_ID.IMPLEMENTER, targetRoleId: BUNDLED_ROLE_ID.REVIEWER },
  { sourceRoleId: BUNDLED_ROLE_ID.REVIEWER, targetRoleId: BUNDLED_ROLE_ID.DELIVERY_ORCHESTRATOR },
] as const;

export const BUNDLED_ROLE_PROFILE: BundledRoleProfile = {
  id: BUNDLED_ROLE_PROFILE_ID,
  entryRoleId: BUNDLED_ROLE_ID.HUMAN_INTERFACE,
  artifactContractRef: BUNDLED_ROLE_ARTIFACT_CONTRACT_REF,
  modelCapabilityId: BUNDLED_ROLE_MODEL_CAPABILITY_ID,
  roles: ROLES,
  handoffs: HANDOFFS,
};
