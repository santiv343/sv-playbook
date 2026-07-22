import { and, eq, notInArray } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { LifecycleError } from './service.errors.js';
import { MISSING_PACKET_DEPENDENCY, STATUS } from './service.constants.js';
import { packetDependencies, packets } from './schema.constants.js';

export function currentPacketStatus(store: Store, packetId: string): string {
  const row = store.orm.select({ status: packets.status }).from(packets)
    .where(eq(packets.id, packetId)).get();
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  return row.status;
}

// Corre en los TRES puntos donde un packet puede declarar dependsOn:
// createPacket, upsertPacketFile (import/update) e importPacketFile (ver
// service.ts) — antes, sólo el primero validaba, así que declarar una
// dependencia hacia un packet inexistente vía import se guardaba
// silenciosamente y sólo fallaba mucho después, al intentar activar el
// packet. Corregido esta semana (IDEA-119): fail-closed en el momento de
// declarar, no en el momento de usar.
export function validateDependencyReferences(store: Store, packetId: string, dependencyIds: readonly string[]): void {
  for (const dependencyId of dependencyIds) {
    const dependency = store.orm.select({ id: packets.id }).from(packets).where(eq(packets.id, dependencyId)).get();
    if (dependency === undefined) {
      throw new LifecycleError(`packet ${packetId} ${MISSING_PACKET_DEPENDENCY}: ${dependencyId}`);
    }
  }
}

// Llamado desde startPacket() (service.ts, flujo 3): un packet no puede
// activarse si alguna de sus dependencias todavía no llegó a un estado
// terminal (done/dropped) — trabajar sobre algo que depende de una base
// que todavía puede cambiar sería construir sobre arena.
export function assertDependenciesTerminal(store: Store, packetId: string): void {
  const unmet = store.orm.select({ id: packetDependencies.dependsOnId, status: packets.status })
    .from(packetDependencies)
    .innerJoin(packets, eq(packets.id, packetDependencies.dependsOnId))
    .where(and(
      eq(packetDependencies.packetId, packetId),
      notInArray(packets.status, [STATUS.DONE, STATUS.DROPPED]),
    ))
    .orderBy(packetDependencies.dependsOnId).all()
    .map((row) => `${row.id} (${row.status})`);
  if (unmet.length > 0) throw new LifecycleError(`unmet dependencies: ${unmet.join(', ')}`);
}
