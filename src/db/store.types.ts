import type { DatabaseSync } from 'node:sqlite';

export interface Store {
  readonly db: DatabaseSync;
  readonly dir: string;
  close(): void;
}
