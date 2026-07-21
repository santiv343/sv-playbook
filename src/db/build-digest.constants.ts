// Archivo que readBuildDigest (build-digest.ts) lee, generado durante el
// build — no existe en checkout limpio sin buildear, por eso esa función
// devuelve null en vez de lanzar cuando falta.
export const BUILD_DIGEST_FILE_NAME = 'build-digest.json';
export const BUILD_DIGEST_FIELD = 'digest';
