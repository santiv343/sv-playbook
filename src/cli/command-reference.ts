import { COMMAND_REFERENCE_MARKERS, COMMAND_REFERENCE_TABLE_HEADER, MARKER_NOT_FOUND } from './command-reference.constants.js';
import type { CommandReferenceEntry } from './command-reference.types.js';

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|');
}

export function renderCommandReferenceBlock(entries: readonly CommandReferenceEntry[]): string {
  const rows = entries.map((entry) => `| \`${entry.name}\` | ${escapeCell(entry.summary)} |`);
  return [...COMMAND_REFERENCE_TABLE_HEADER, ...rows].join('\n');
}

// Reemplaza SÓLO el contenido entre dos marcadores literales en el
// documento (BEGIN/END), preservando todo lo demás — el mismo patrón que
// setSection/regenerateExport en constitution.ts usa para no pisar
// prosa escrita a mano alrededor de contenido generado. Lanza si los
// marcadores no están (documento corrupto o marcadores movidos) en vez de
// insertar el bloque en un lugar arbitrario.
export function syncCommandReferenceDoc(docText: string, block: string): string {
  const beginIndex = docText.indexOf(COMMAND_REFERENCE_MARKERS.BEGIN);
  const endIndex = docText.indexOf(COMMAND_REFERENCE_MARKERS.END);
  if (beginIndex === MARKER_NOT_FOUND || endIndex === MARKER_NOT_FOUND || endIndex < beginIndex) {
    throw new Error('command reference markers not found in docs/how-it-works.md');
  }
  const before = docText.slice(0, beginIndex + COMMAND_REFERENCE_MARKERS.BEGIN.length);
  const after = docText.slice(endIndex);
  return `${before}\n${block}\n${after}`;
}
