import { digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { ParsedStructuredOutput, StructuredOutputNormalization } from './structured-output.types.js';
import { STRUCTURED_OUTPUT_ERROR, STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';

const JSON_FENCE = /^```json\r?\n([\s\S]*?)\r?\n?```$/;

function parse(text: string, normalization: StructuredOutputNormalization, raw: string): ParsedStructuredOutput {
  try {
    const value: unknown = JSON.parse(text);
    return { value, receipt: { rawOutputDigest: digest(raw), normalization } };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ContextError(STRUCTURED_OUTPUT_ERROR.INVALID, detail);
  }
}

// Dos intentos, en orden: primero JSON crudo tal cual (RAW_JSON — lo que se
// espera del modo VALIDATED_TEXT de OpenCode); si eso falla, intenta pelar
// un fence ```json ... ``` y reparsear (SINGLE_JSON_FENCE — algunos
// modelos envuelven su output en markdown pese a que se les pidió no
// hacerlo). El `normalization` que queda en el receipt documenta CUÁL de
// los dos caminos se usó — es evidencia de que hubo que normalizar, no
// sólo el resultado final.
export function parseAgentJsonOutput(raw: string): ParsedStructuredOutput {
  const text = raw.trim();
  try {
    return parse(text, STRUCTURED_OUTPUT_NORMALIZATION.RAW_JSON, raw);
  } catch (error: unknown) {
    const fenced = JSON_FENCE.exec(text);
    if (fenced === null || fenced[1] === undefined) throw error;
    return parse(fenced[1], STRUCTURED_OUTPUT_NORMALIZATION.SINGLE_JSON_FENCE, raw);
  }
}
