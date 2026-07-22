import type { DOCTOR_LABEL, DOCTOR_STATUS } from './doctor.constants.js';

export type DoctorStatus = (typeof DOCTOR_STATUS)[keyof typeof DOCTOR_STATUS];
export type DoctorLabel = (typeof DOCTOR_LABEL)[keyof typeof DOCTOR_LABEL];

// Cada *Check() de doctor.ts devuelve esto — nunca lanza, así un chequeo
// roto (p.ej. store corrupto) no aborta el resto del diagnóstico.
export interface CheckResult {
  readonly label: DoctorLabel;
  readonly status: DoctorStatus;
  readonly detail: string;
}
