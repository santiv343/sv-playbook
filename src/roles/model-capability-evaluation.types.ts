import type {
  AdapterRunObservation,
  ExecutionProfile,
} from '../gateway/gateway.types.js';
import type { StructuredOutputReceipt } from '../contracts/structured-output.types.js';

export interface ModelCapabilityEvaluationScore {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

export interface ModelCapabilityEvaluationOptions {
  readonly now: Date;
  readonly validityDays: number;
}

// Evalúa si un modelo/adapter concreto es apto para ejercer un rol: le
// manda el prompt fijo de model-capability-evaluation.constants.ts (3 casos
// con respuesta correcta conocida) y compara el output real contra
// MODEL_CAPABILITY_EVALUATION_EXPECTED. adapterEvidence/sessionEvidence/
// submissionEvidence/observationEvidence son las 4 capas de evidencia cruda
// que sustentan `passed` — nada se acepta sólo porque el LLM "dice" que
// pasó (PRINCIPLE-001: todo claim respaldado por output literal).
export interface ModelCapabilityEvaluationReceipt {
  readonly id: string;
  readonly suiteId: string;
  readonly suiteDigest: string;
  readonly capabilityId: string;
  readonly profileId: string;
  readonly adapterId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly variant: string | null;
  readonly adapterProfileDigest: string;
  readonly sessionId: string;
  readonly messageId: string;
  readonly adapterEvidence: Readonly<Record<string, unknown>>;
  readonly sessionEvidence: Readonly<Record<string, unknown>>;
  readonly submissionEvidence: Readonly<Record<string, unknown>>;
  readonly observationEvidence: Readonly<Record<string, unknown>>;
  readonly output: unknown;
  readonly outputReceipt: StructuredOutputReceipt | null;
  readonly observedToolIds: readonly string[];
  readonly passed: boolean;
  readonly violations: readonly string[];
  readonly assessedAt: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly receiptDigest: string;
}

export interface ModelCapabilityEvaluationSummary {
  readonly id: string;
  readonly suiteId: string;
  readonly capabilityId: string;
  readonly profileId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly variant: string | null;
  readonly passed: boolean;
  readonly assessedAt: string;
  readonly expiresAt: string;
  readonly receiptDigest: string;
}

export interface ModelCapabilityEvaluationRun {
  readonly profile: ExecutionProfile;
  readonly observation: AdapterRunObservation;
}
