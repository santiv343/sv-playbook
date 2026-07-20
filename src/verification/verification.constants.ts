import type { VerificationComponent } from './verification.types.js';

// VERIFICATION_MANIFEST son los 4 componentes REALES que `npm run verify`
// corre — incluye PLAYBOOK (`node bin/sv-playbook.js check`, los gates
// propios del sistema) en pie de igualdad con typecheck/lint/test. Cambiar
// qué se verifica es editar esta lista, no el runner (runner.ts, que es
// genérico sobre cualquier VerificationComponent[]).
export const VERIFICATION_COMPONENT = {
  TYPECHECK: 'typecheck',
  LINT: 'lint',
  TEST: 'test',
  PLAYBOOK: 'playbook',
} as const;

export const VERIFICATION_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
} as const;

export const VERIFICATION_MANIFEST: readonly VerificationComponent[] = [
  { id: VERIFICATION_COMPONENT.TYPECHECK, command: 'npm run typecheck' },
  { id: VERIFICATION_COMPONENT.LINT, command: 'npm run lint' },
  { id: VERIFICATION_COMPONENT.TEST, command: 'npm run test' },
  { id: VERIFICATION_COMPONENT.PLAYBOOK, command: 'node bin/sv-playbook.js check' },
];
