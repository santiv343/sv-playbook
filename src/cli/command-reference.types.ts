// Subconjunto mínimo de Command (sólo name+summary) — lo único que
// renderCommandReferenceBlock necesita para la tabla del doc, sin acoplar
// el generador al resto del contrato de Command (usage, run, etc).
export interface CommandReferenceEntry {
  name: string;
  summary: string;
}
