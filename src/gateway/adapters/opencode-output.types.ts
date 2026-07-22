export type OpenCodeOutputStatus = 'pending' | 'accepted' | 'ambiguous' | 'rejected';

// Los 4 estados de reconcileOpenCodeOutput (opencode-output.ts):
// pending (todavía no hay respuesta), accepted (una respuesta válida sin
// tool calls), rejected (usó tools o no tiene texto), ambiguous (más de
// una respuesta assistant — señal de bug del proveedor, ver el comentario
// en opencode-output.ts).
export interface OpenCodeOutputReconciliation {
  status: OpenCodeOutputStatus;
  responseMessageIds: readonly string[];
  rawText?: string;
  violations: readonly string[];
}
