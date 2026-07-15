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
