export interface SecretViolation {
  readonly path: string;
  readonly line: number;
  readonly kind: string;
}
