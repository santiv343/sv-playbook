import { GENERATED_PACKET_PREFIX, ID_RE, PACKET_FIELD, PACKET_FIELD_SEPARATOR, PACKET_LINE_SEPARATOR } from './document.constants.js';
import { PacketFormatError } from './document.errors.js';
import type { PacketDefinition } from './document.types.js';

function assertValid(def: PacketDefinition): void {
  if (!ID_RE.test(def.id)) throw new PacketFormatError(`invalid packet id: ${def.id}`);
  if (def.title.trim() === '') throw new PacketFormatError('title must not be empty');
  if (def.writeSet.length === 0) throw new PacketFormatError('write_set must not be empty');
}

function jsonArray(values: string[]): string {
  return JSON.stringify(values);
}

function tagLines(def: PacketDefinition): string[] {
  return def.tags === undefined ? [] : [`tags: ${jsonArray(def.tags)}`];
}

export function generatePacketDocument(def: PacketDefinition, body: string): string {
  assertValid(def);
  return [
    '<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->',
    '---',
    `id: ${def.id}`,
    `title: ${def.title}`,
    `depends_on: ${jsonArray(def.dependsOn)}`,
    `write_set: ${jsonArray(def.writeSet)}`,
    `requirements: ${jsonArray(def.requirements)}`,
    `evidence_required: ${jsonArray(def.evidenceRequired)}`,
    ...tagLines(def),
    '---',
    '',
    body,
  ].join('\n');
}

function parseStringArray(raw: string, key: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PacketFormatError(`${key} is not a JSON array`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new PacketFormatError(`${key} must be an array of strings`);
  }
  return parsed;
}

export function parsePacketDocument(text: string): { definition: PacketDefinition; body: string } {
  let content = text;
  if (content.startsWith(GENERATED_PACKET_PREFIX)) {
    const nl = content.indexOf(PACKET_LINE_SEPARATOR);
    if (nl !== -1) content = content.slice(nl + 1);
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n\r?\n?([\s\S]*)$/.exec(content);
  if (m === null || m[1] === undefined || m[2] === undefined) {
    throw new PacketFormatError('missing frontmatter fences');
  }
  const fields = new Map<string, string>();
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(PACKET_FIELD_SEPARATOR);
    if (idx === -1) throw new PacketFormatError(`malformed frontmatter line: ${line}`);
    fields.set(line.slice(0, idx), line.slice(idx + 2));
  }
  const get = (key: string): string => {
    const v = fields.get(key);
    if (v === undefined) throw new PacketFormatError(`missing key: ${key}`);
    return v;
  };
  const definition: PacketDefinition = {
    id: get(PACKET_FIELD.ID),
    title: get(PACKET_FIELD.TITLE),
    dependsOn: parseStringArray(get(PACKET_FIELD.DEPENDS_ON), PACKET_FIELD.DEPENDS_ON),
    writeSet: parseStringArray(get(PACKET_FIELD.WRITE_SET), PACKET_FIELD.WRITE_SET),
    requirements: parseStringArray(get(PACKET_FIELD.REQUIREMENTS), PACKET_FIELD.REQUIREMENTS),
    evidenceRequired: parseStringArray(get(PACKET_FIELD.EVIDENCE_REQUIRED), PACKET_FIELD.EVIDENCE_REQUIRED),
  };
  if (fields.has(PACKET_FIELD.TAGS)) {
    definition.tags = parseStringArray(get(PACKET_FIELD.TAGS), PACKET_FIELD.TAGS);
  }
  assertValid(definition);
  return { definition, body: m[2] };
}
