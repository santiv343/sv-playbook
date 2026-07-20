// `confidence` es lo que distingue un hecho verificable (1.0, leído
// directo de config) de una inferencia sobre contenido de archivo (0.9,
// heurística de substring) — ver taste-infer.ts.
export interface InferredConvention {
  statement: string;
  confidence: number;
  evidence: string[];
}
