// Error de mismatch de schema/versión — lanzado por store.migrations.ts al
// intentar migrar un store cuya versión de schema no encaja con lo
// esperado (más vieja de lo migrable, o más nueva que este build sabe
// leer). Separado de otros errores de store para que los callers puedan
// decidir "esto necesita migración/backup" en vez de tratarlo como
// corrupción genérica.
export class StoreVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreVersionError';
  }
}
