// Error dedicado que lanzan checkDbIntegrity/validateMetadata (db/backup.ts)
// — separa "esto no es un backup restaurable" de errores de sistema
// genéricos, así restoreStateBackup puede mostrar mensajes accionables
// (integridad, versión de schema, sha256 mismatch) sin que el caller tenga
// que inspeccionar el texto del mensaje para clasificar el fallo.
export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreError';
  }
}
