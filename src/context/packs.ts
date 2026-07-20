import type { Store } from '../db/store.types.js';
import { canonicalJson } from './digest.js';
import { REFERENCE_VERSION_SEPARATOR } from '../platform.constants.js';
import type { CompiledContextPack, ContextCompileInput } from './context.types.js';

function parseRef(ref: string): { id: string; version: number } {
  const separator = ref.lastIndexOf(REFERENCE_VERSION_SEPARATOR);
  return { id: ref.slice(0, separator), version: Number(ref.slice(separator + 1)) };
}

// Un context pack es inmutable y con clave natural (semantic_digest UNIQUE
// en el schema) — por eso todo INSERT acá es `INSERT OR IGNORE`: si el
// mismo pack ya se compiló antes (mismo input -> mismo digest), esta
// llamada es un no-op silencioso, no un error. La transacción manual
// (BEGIN IMMEDIATE/COMMIT/ROLLBACK, SQL crudo) asegura que el pack y sus
// items/capabilities relacionados se persistan atómicamente — un pack a
// medio persistir (con items pero sin capabilities) rompería la garantía
// de que el pack representa exactamente lo que compileContext() calculó.
export function persistContextPack(store: Store, input: ContextCompileInput, pack: CompiledContextPack): void {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.prepare(`INSERT OR IGNORE INTO context_packs
      (id, schema_version, role, phase, inputs_json, semantic_digest, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(pack.packId, pack.schemaVersion, pack.role, pack.phase, canonicalJson(input), pack.semanticDigest, new Date().toISOString());
    const itemStatement = store.db.prepare(`INSERT OR IGNORE INTO context_pack_items
      (pack_id, item_id, item_version, ordinal, content_digest) VALUES (?, ?, ?, ?, ?)`);
    pack.items.forEach((item, ordinal) => {
      const ref = parseRef(item.ref);
      itemStatement.run(pack.packId, ref.id, ref.version, ordinal, item.contentDigest);
    });
    const capabilityStatement = store.db.prepare(`INSERT OR IGNORE INTO context_pack_capabilities
      (pack_id, capability, effect, source_ref) VALUES (?, ?, ?, ?)`);
    for (const capability of pack.capabilities) {
      capabilityStatement.run(pack.packId, capability.capability, capability.effect, capability.source);
    }
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
