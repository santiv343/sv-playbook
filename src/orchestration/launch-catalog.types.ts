export interface WorkflowLaunchDefinition {
  id: string;
  version: number;
  startStepKey: string;
  inputContractRef: string;
  inputSchema: Readonly<Record<string, unknown>>;
}
