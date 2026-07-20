import type { CAPABILITY_EFFECT, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from './context.constants.js';

export type ContextItemStatus = typeof CONTEXT_ITEM_STATUS[keyof typeof CONTEXT_ITEM_STATUS];
export type ContextItemStrength = typeof CONTEXT_ITEM_STRENGTH[keyof typeof CONTEXT_ITEM_STRENGTH];
export type CapabilityEffect = typeof CAPABILITY_EFFECT[keyof typeof CAPABILITY_EFFECT];

export interface ContextItemInput {
  id: string;
  version: number;
  kind: string;
  status: ContextItemStatus;
  strength: ContextItemStrength;
  semanticKey: string;
  body: string;
  provenance: string;
  tags?: readonly string[];
  selectors?: Readonly<Record<string, readonly string[]>>;
  dependencies?: readonly string[];
  supersedes?: readonly string[];
  capabilities?: Readonly<Record<string, CapabilityEffect>>;
}

export interface StoredContextItem extends ContextItemInput {
  createdAt: string;
  updatedAt: string;
}

export interface ContextCompileInput {
  role: string;
  phase: string;
  tags?: readonly string[];
  attributes?: Readonly<Record<string, readonly string[]>>;
  references?: readonly string[];
  requestedCapabilities: readonly string[];
}

export interface CompiledContextItem {
  ref: string;
  kind: string;
  strength: ContextItemStrength;
  semanticKey: string;
  body: string;
  tags: readonly string[];
  contentDigest: string;
}

// receipt (ContextItemReceipt[]) es la auditoría COMPLETA de la compilación
// de un context pack — no sólo qué items ENTRARON (`selected`/`dependency`/
// `explicit-reference`), también por qué otros NO entraron
// (`selector-mismatch`/`inactive`/`lower-precedence`, con `replacedBy`
// apuntando a qué ítem ganó en su lugar). Esto es lo que permite depurar
// "¿por qué mi agente no recibió tal principio en su contexto?" sin tener
// que releer la lógica de compileContext entera.
export interface ContextItemReceipt {
  ref: string;
  included: boolean;
  reason: 'selected' | 'dependency' | 'explicit-reference' | 'selector-mismatch' | 'inactive' | 'lower-precedence';
  replacedBy: string | null;
}

export interface CapabilityDecision {
  capability: string;
  effect: CapabilityEffect;
  source: string | null;
}

export interface CompiledContextPack {
  schemaVersion: 1;
  packId: string;
  role: string;
  phase: string;
  items: readonly CompiledContextItem[];
  capabilities: readonly CapabilityDecision[];
  semanticDigest: string;
  receipt: readonly ContextItemReceipt[];
}
