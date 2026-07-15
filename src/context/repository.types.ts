import type { StoredContextItem } from './context.types.js';

export interface ContextCatalog {
  items: readonly StoredContextItem[];
  precedence: Readonly<Record<string, number>>;
}
