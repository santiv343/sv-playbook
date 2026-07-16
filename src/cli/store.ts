import { commonRoot, openStore } from '../db/store.js';
import type { Store } from '../db/store.types.js';
import { getCwd } from '../runtime/context.js';

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
