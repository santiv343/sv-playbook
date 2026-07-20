import type { StoredContextItem } from './context.types.js';

// La "foto" completa de contexto disponible que compileContext() necesita
// para resolver un pack — todos los items (con su status/strength/etc, no
// filtrados todavía) más el mapa de precedencia por kind. loadContextCatalog
// (context/repository.ts) carga esto una vez por compilación; el filtrado
// real (qué entra, qué gana por precedencia) pasa en compiler.ts, no acá.
export interface ContextCatalog {
  items: readonly StoredContextItem[];
  precedence: Readonly<Record<string, number>>;
}
