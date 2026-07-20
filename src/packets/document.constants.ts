// ID_RE es el formato real de un packet id (`FEAT-042`, `GATE-012-PROMOTION`)
// — mayúsculas, dígitos, guiones como separador, al menos un segmento
// después del prefijo. TASK_TYPE_PREFIX (tasks/service.constants.ts) es
// quien elige el prefijo válido; este regex sólo valida la FORMA general,
// no que el prefijo específico exista.
export const ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/;
export const GENERATED_PACKET_PREFIX = '<!-- GENERATED';
export const PACKET_FIELD_SEPARATOR = ': ';
export const PACKET_LINE_SEPARATOR = '\n';
export const PACKET_FIELD = {
  ID: 'id',
  TITLE: 'title',
  DEPENDS_ON: 'depends_on',
  WRITE_SET: 'write_set',
  REQUIREMENTS: 'requirements',
  EVIDENCE_REQUIRED: 'evidence_required',
  TAGS: 'tags',
} as const;
