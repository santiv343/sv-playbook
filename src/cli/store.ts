import { commonRoot, openStore } from '../db/store.js';
import type { Store } from '../db/store.types.js';
import { getCwd } from '../runtime/context.js';

// Implementación compartida de "abrir store, ejecutar, cerrar siempre" —
// ver F-013 en findings.md: sólo promotion.ts y task.ts la importan de acá;
// 8 comandos más definen su propia copia local idéntica en vez de usar
// ésta.
export function withStore<T>(operation: (store: Store, repoRoot: string) => T): T {
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    return operation(store, repoRoot);
  } finally {
    store.close();
  }
}

export async function withStoreAsync<T>(
  operation: (store: Store, repoRoot: string) => Promise<T>,
): Promise<T> {
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    return await operation(store, repoRoot);
  } finally {
    store.close();
  }
}
