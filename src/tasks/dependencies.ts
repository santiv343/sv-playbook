import { and, eq, notInArray } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { LifecycleError } from './service.errors.js';
import { STATUS } from './service.constants.js';
import { packetDependencies, packets } from './schema.constants.js';

export function currentPacketStatus(store: Store, packetId: string): string {
  const row = store.orm.select({ status: packets.status }).from(packets)
    .where(eq(packets.id, packetId)).get();
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  return row.status;
}

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
