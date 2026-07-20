import * as s from '../schema/core.js';
import { WORK_DEFINITION_SCHEMA_VERSION } from './work-definition.constants.js';

// Validación runtime del contenido guardado en packet_definitions.definition_json
// — stored() en work-definitions.ts la usa para confirmar que lo que salió
// de la DB sigue siendo un WorkDefinitionValue válido antes de confiar en
// su digest.
export const WorkDefinitionValueSchema = s.object({
  schemaVersion: s.literal(WORK_DEFINITION_SCHEMA_VERSION),
  id: s.string(),
  title: s.string(),
  body: s.string(),
  type: s.string(),
  dependsOn: s.array(s.string()),
  writeSet: s.array(s.string()),
  requirements: s.array(s.string()),
  evidenceRequired: s.array(s.string()),
  tags: s.array(s.string()),
});
