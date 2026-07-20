// Shape mínimo para arrancar un workflow desde afuera — inputSchema ya
// resuelto (no sólo la ref) es lo que le permite a un consumidor (la
// consola operativa) armar un formulario válido sin una segunda consulta.
export interface WorkflowLaunchDefinition {
  id: string;
  version: number;
  startStepKey: string;
  inputContractRef: string;
  inputSchema: Readonly<Record<string, unknown>>;
}
