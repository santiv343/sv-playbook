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
