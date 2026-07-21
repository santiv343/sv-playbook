// El shape que generatePacketDocument/parsePacketDocument serializan a/desde
// markdown — subconjunto de WorkDefinitionValue (tasks/work-definition.types.ts)
// sin schemaVersion/body/type, porque esos campos viven aparte en el .md
// (body es el contenido libre después del frontmatter, no un campo del
// frontmatter mismo).
export interface PacketDefinition {
  id: string;
  title: string;
  dependsOn: string[];
  writeSet: string[];
  requirements: string[];
  evidenceRequired: string[];
  tags?: string[];
}
