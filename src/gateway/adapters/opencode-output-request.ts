import { canonicalJson } from '../../context/digest.js';
import {
  OPENCODE_DEFAULT,
  OPENCODE_MESSAGE_FIELD,
  OPENCODE_OUTPUT_FORMAT,
  OPENCODE_OUTPUT_MODE,
  OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT,
  type OpenCodeOutputMode,
} from './opencode.constants.js';

export function applyOpenCodeOutputContract(
  body: Record<string, unknown>,
  outputMode: OpenCodeOutputMode,
  outputSchema: Readonly<Record<string, unknown>>,
): void {
  if (outputMode === OPENCODE_OUTPUT_MODE.NATIVE) {
    body[OPENCODE_MESSAGE_FIELD.OUTPUT_FORMAT] = {
      type: OPENCODE_OUTPUT_FORMAT.JSON_SCHEMA,
      schema: outputSchema,
      retryCount: OPENCODE_DEFAULT.STRUCTURED_OUTPUT_RETRY_COUNT,
    };
    return;
  }
  body.system = `${OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT}\nJSON Schema:\n${canonicalJson(outputSchema)}`;
}
