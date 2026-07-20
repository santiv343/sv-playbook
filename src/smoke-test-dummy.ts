// Análogo de e2e-dummy.ts pero para el smoke test del paquete publicado —
// confirma que el build empaquetado se puede importar y ejecutar, no
// prueba lógica de producto.
export function smokeTestDummy(): number {
  return 42;
}
