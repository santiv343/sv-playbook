import { canonicalJson } from '../../context/digest.js';
import {
  OPENCODE_DEFAULT,
  OPENCODE_MESSAGE_FIELD,
  OPENCODE_OUTPUT_FORMAT,
  OPENCODE_OUTPUT_MODE,
  OPENCODE_PROMPTED_JSON_SYSTEM_PROMPT,
  OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT,
  type OpenCodeOutputMode,
} from './opencode.constants.js';

// Tres formas de forzar el output contract según OPENCODE_OUTPUT_MODE (ver
// su comentario en opencode.constants.ts): NATIVE usa el campo estructurado
// nativo de OpenCode (`format: json_schema` + reintentos automáticos del
// lado del servidor) — pero algunos proveedores en modo "thinking" rechazan
// combinar `format` con `tools` (confirmado en vivo con DeepSeek); las
// otras dos formas piden el JSON por prompt en vez de por `format`,
// diferenciándose sólo en si prohíben tools o no: VALIDATED_TEXT (sin
// tools, fallback histórico) y PROMPTED_JSON (con tools, para roles que
// necesitan ejecutar acciones reales y aun así deben terminar en JSON
// válido contra outputContractRef).
const SYSTEM_PROMPT_BY_MODE: Partial<Record<OpenCodeOutputMode, string>> = {
  [OPENCODE_OUTPUT_MODE.VALIDATED_TEXT]: OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT,
  [OPENCODE_OUTPUT_MODE.PROMPTED_JSON]: OPENCODE_PROMPTED_JSON_SYSTEM_PROMPT,
};

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
  const prompt = SYSTEM_PROMPT_BY_MODE[outputMode] ?? OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT;
  body.system = `${prompt}\nJSON Schema:\n${canonicalJson(outputSchema)}`;
}
