// Punto de entrada único del namespace `s` (schema/index.ts) — el resto del
// codebase importa `{ s } from '../schema/index.js'` en vez de conocer la
// estructura interna de archivos de schema/.
export * as s from './core.js';
export * from './config.constants.js';
export * from './store.constants.js';
