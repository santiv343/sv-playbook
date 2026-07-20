import { canonicalJson } from '../../context/digest.js';
import {
  OPENCODE_DEFAULT,
  OPENCODE_MESSAGE_FIELD,
  OPENCODE_OUTPUT_FORMAT,
  OPENCODE_OUTPUT_MODE,
  OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT,
  type OpenCodeOutputMode,
} from './opencode.constants.js';

// Dos formas de forzar el output contract según OPENCODE_OUTPUT_MODE (ver
// su comentario en opencode.constants.ts): NATIVE usa el campo estructurado
// nativo de OpenCode (`format: json_schema` + reintentos automáticos del
// lado del servidor); VALIDATED_TEXT inyecta el schema como texto en el
// system prompt y confía en que reconcileOpenCodeOutput valide el texto
// crudo después — el fallback para proveedores sin soporte nativo de
// output estructurado.
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
