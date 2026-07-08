import type { DOCTOR_LABEL, DOCTOR_STATUS } from './doctor.constants.js';

export type DoctorStatus = (typeof DOCTOR_STATUS)[keyof typeof DOCTOR_STATUS];
export type DoctorLabel = (typeof DOCTOR_LABEL)[keyof typeof DOCTOR_LABEL];

export interface CheckResult {
  readonly label: DoctorLabel;
  readonly status: DoctorStatus;
  readonly detail: string;
}
