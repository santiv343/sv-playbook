export interface PacketDefinition {
  id: string;
  title: string;
  dependsOn: string[];
  writeSet: string[];
  requirements: string[];
  evidenceRequired: string[];
  tags?: string[];
}
