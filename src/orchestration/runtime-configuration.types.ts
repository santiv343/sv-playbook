// Input de setWorkflowCoordinatorTiming (runtime-configuration.ts), que
// valida leaseRenewalIntervalMs < effectLeaseMs antes de aceptar — el mismo
// invariante que el CHECK de SQL en workflow_coordinator_config
// (db/orchestration.schema.constants.ts) refuerza a nivel de base de datos.
export interface WorkflowCoordinatorTimingInput {
  effectLeaseMs: number;
  leaseRenewalIntervalMs: number;
  idlePollIntervalMs: number;
}
