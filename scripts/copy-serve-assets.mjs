import { cpSync } from 'node:fs';

const source = new URL('../src/serve/assets/', import.meta.url);
const target = new URL('../dist/serve/assets/', import.meta.url);
cpSync(source, target, { recursive: true });
