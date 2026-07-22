// Todos los campos opcionales — sólo se aplican los que vienen presentes
// (ver amendedDefinition en amend.ts, `updates.field ?? current.field`).
// En estado ACTIVE, assertActiveAmendFields exige que sólo `writeSet` esté
// presente; el resto se rechaza aunque el tipo lo permita.
export interface AmendPacketUpdates {
  title?: string;
  body?: string;
  writeSet?: string[];
  dependsOn?: string[];
  requirements?: string[];
  evidenceRequired?: string[];
  tags?: string[];
}
