// Sin fingerprint/baseline — a diferencia de los gates de deuda, un
// secreto detectado siempre es rojo, nunca "perdonado" por baseline
// (scanForSecrets en secrets.ts no tiene mecanismo de grandfathering).
export interface SecretViolation {
  readonly path: string;
  readonly line: number;
  readonly kind: string;
}
