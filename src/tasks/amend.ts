import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import type { Store } from '../db/store.types.js';
import { canonicalJson } from '../context/digest.js';
import { generatePacketDocument } from '../packets/document.js';
import type { PacketDefinition } from '../packets/document.types.js';
import { STATUS } from './service.constants.js';
import { LifecycleError } from './service.errors.js';
import { packetDependencies, packets } from './schema.constants.js';
import { transact } from './transaction.js';
import { loadWorkDefinition, recordWorkDefinition, workDefinitionValue } from './work-definitions.js';
import type { AmendPacketUpdates } from './amend.types.js';

function assertAmendable(status: string, packetId: string): void {
  if (status === STATUS.DRAFT || status === STATUS.READY) return;
  throw new LifecycleError(`cannot amend packet ${packetId} in status ${status}`, 'only draft and ready packets can be amended');
}

function amendedDefinition(
  packetId: string,
  current: ReturnType<typeof workDefinitionValue>,
  currentTitle: string,
  updates: AmendPacketUpdates,
): PacketDefinition {
  return {
    id: packetId,
    title: updates.title ?? currentTitle,
    dependsOn: updates.dependsOn ?? [...current.dependsOn],
    writeSet: updates.writeSet ?? [...current.writeSet],
    requirements: updates.requirements ?? [...current.requirements],
    evidenceRequired: updates.evidenceRequired ?? [...current.evidenceRequired],
    tags: updates.tags ?? [...current.tags],
  };
}

function replaceDependencies(store: Store, definition: PacketDefinition): void {
  store.orm.delete(packetDependencies).where(eq(packetDependencies.packetId, definition.id)).run();
  for (const dependencyId of definition.dependsOn) {
    const exists = store.orm.select({ id: packets.id }).from(packets).where(eq(packets.id, dependencyId)).get();
    if (exists !== undefined) {
      store.orm.insert(packetDependencies).values({ packetId: definition.id, dependsOnId: dependencyId }).run();
    }
  }
}

export function amendPacket(
  store: Store,
  _docRoot: string,
  packetId: string,
  updates: AmendPacketUpdates,
): void {
  const row = store.orm.select().from(packets).where(eq(packets.id, packetId)).get();
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  assertAmendable(row.status, packetId);
  const current = loadWorkDefinition(store, packetId).value;
  const definition = amendedDefinition(packetId, current, row.title, updates);
  const body = updates.body ?? row.body;
  transact(store, () => {
    store.orm.update(packets).set({
      title: definition.title,
      body,
      writeSetJson: canonicalJson(definition.writeSet),
      updatedAt: new Date().toISOString(),
    }).where(eq(packets.id, packetId)).run();
    replaceDependencies(store, definition);
    recordWorkDefinition(store, workDefinitionValue(definition, body, current.type));
  });
  writeFileSync(row.path, generatePacketDocument(definition, body), 'utf8');
}
