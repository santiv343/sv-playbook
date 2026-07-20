import {
  CAPABILITY_EFFECT,
  CONTEXT_ERROR,
  CONTEXT_ITEM_STATUS,
  CONTEXT_PACK_SCHEMA_VERSION,
  SELECTOR_WILDCARD,
} from './context.constants.js';
import { ContextError } from './context.errors.js';
import { compareOrdinal, digest } from './digest.js';
import type { ContextCatalog } from './repository.types.js';
import type {
  CapabilityDecision,
  CompiledContextItem,
  CompiledContextPack,
  ContextCompileInput,
  ContextItemReceipt,
  StoredContextItem,
} from './context.types.js';

interface SelectedItem {
  item: StoredContextItem;
  reason: ContextItemReceipt['reason'];
}

const SELECTOR_MISMATCH_REASON = 'selector-mismatch' as const;

function itemRef(item: Pick<StoredContextItem, 'id' | 'version'>): string {
  return `${item.id}@${item.version}`;
}

function requestAttributes(input: ContextCompileInput): Readonly<Record<string, readonly string[]>> {
  return {
    ...(input.attributes ?? {}),
    role: [input.role],
    phase: [input.phase],
    tag: [...new Set(input.tags ?? [])].sort(),
  };
}

function selectorMatches(expected: readonly string[], actual: readonly string[] | undefined): boolean {
  if (expected.length === 0 || expected.includes(SELECTOR_WILDCARD)) return true;
  if (actual === undefined) return false;
  const actualValues = new Set(actual);
  return expected.some((value) => actualValues.has(value));
}

function isApplicable(item: StoredContextItem, attributes: Readonly<Record<string, readonly string[]>>): boolean {
  return Object.entries(item.selectors ?? {}).every(([dimension, expected]) => selectorMatches(expected, attributes[dimension]));
}

function indexCatalog(catalog: ContextCatalog): Map<string, StoredContextItem> {
  const byRef = new Map<string, StoredContextItem>();
  const activeIds = new Set<string>();
  for (const item of catalog.items) {
    const ref = itemRef(item);
    if (byRef.has(ref)) throw new ContextError(CONTEXT_ERROR.DUPLICATE_ITEM, `duplicate context item ${ref}`);
    byRef.set(ref, item);
    if (item.status !== CONTEXT_ITEM_STATUS.ACTIVE) continue;
    if (activeIds.has(item.id)) throw new ContextError(CONTEXT_ERROR.DUPLICATE_ACTIVE_VERSION, `multiple active versions for ${item.id}`);
    activeIds.add(item.id);
  }
  return byRef;
}

function requireReference(byRef: ReadonlyMap<string, StoredContextItem>, ref: string): StoredContextItem {
  const item = byRef.get(ref);
  if (item === undefined) throw new ContextError(CONTEXT_ERROR.MISSING_REFERENCE, `missing context item ${ref}`);
  if (item.status !== CONTEXT_ITEM_STATUS.ACTIVE) throw new ContextError(CONTEXT_ERROR.INACTIVE_REFERENCE, `context item ${ref} is ${item.status}`);
  return item;
}

function addDependencies(
  selected: Map<string, SelectedItem>,
  byRef: ReadonlyMap<string, StoredContextItem>,
  attributes: Readonly<Record<string, readonly string[]>>,
  ref: string,
  visiting: Set<string>,
): void {
  if (visiting.has(ref)) throw new ContextError(CONTEXT_ERROR.DEPENDENCY_CYCLE, `context dependency cycle at ${ref}`);
  const item = requireReference(byRef, ref);
  if (!isApplicable(item, attributes)) throw new ContextError(CONTEXT_ERROR.DEPENDENCY_NOT_APPLICABLE, `${ref} is required but not applicable`);
  if (selected.has(ref)) return;

  visiting.add(ref);
  selected.set(ref, { item, reason: 'dependency' });
  for (const dependency of item.dependencies ?? []) addDependencies(selected, byRef, attributes, dependency, visiting);
  visiting.delete(ref);
}

function selectCandidates(catalog: ContextCatalog, input: ContextCompileInput, byRef: ReadonlyMap<string, StoredContextItem>): Map<string, SelectedItem> {
  const attributes = requestAttributes(input);
  const selected = new Map<string, SelectedItem>();
  for (const item of catalog.items) {
    if (item.status === CONTEXT_ITEM_STATUS.ACTIVE && isApplicable(item, attributes)) {
      selected.set(itemRef(item), { item, reason: 'selected' });
    }
  }
  for (const ref of input.references ?? []) {
    const item = requireReference(byRef, ref);
    if (!isApplicable(item, attributes)) throw new ContextError(CONTEXT_ERROR.REFERENCE_NOT_APPLICABLE, `${ref} is referenced but not applicable`);
    selected.set(ref, { item, reason: 'explicit-reference' });
  }
  for (const [ref, candidate] of [...selected]) {
    for (const dependency of candidate.item.dependencies ?? []) {
      addDependencies(selected, byRef, attributes, dependency, new Set([ref]));
    }
  }
  return selected;
}

function rankOf(catalog: ContextCatalog, item: StoredContextItem): number {
  const rank = catalog.precedence[item.kind];
  if (rank === undefined) throw new ContextError(CONTEXT_ERROR.MISSING_PRECEDENCE, `no precedence configured for context kind ${item.kind}`);
  return rank;
}

function resolveSemanticConflicts(catalog: ContextCatalog, selected: Map<string, SelectedItem>): Map<string, SelectedItem> {
  const groups = new Map<string, Array<[string, SelectedItem]>>();
  for (const entry of selected) {
    const group = groups.get(entry[1].item.semanticKey) ?? [];
    group.push(entry);
    groups.set(entry[1].item.semanticKey, group);
  }

  const resolved = new Map<string, SelectedItem>();
  for (const [semanticKey, group] of groups) {
    const topRank = Math.max(...group.map(([, value]) => rankOf(catalog, value.item)));
    const winners = group.filter(([, value]) => rankOf(catalog, value.item) === topRank);
    if (winners.length !== 1) {
      throw new ContextError(CONTEXT_ERROR.CONTEXT_CONFLICT, `unresolved ${semanticKey}: ${winners.map(([ref]) => ref).sort().join(', ')}`);
    }
    const winner = winners[0];
    if (winner !== undefined) resolved.set(winner[0], winner[1]);
  }
  return resolved;
}

function compileItems(catalog: ContextCatalog, selected: ReadonlyMap<string, SelectedItem>): CompiledContextItem[] {
  return [...selected].sort((left, right) => {
    const rank = rankOf(catalog, right[1].item) - rankOf(catalog, left[1].item);
    return rank === 0 ? compareOrdinal(left[0], right[0]) : rank;
  }).map(([ref, value]) => ({
    ref,
    kind: value.item.kind,
    strength: value.item.strength,
    semanticKey: value.item.semanticKey,
    body: value.item.body,
    tags: [...(value.item.tags ?? [])].sort(),
    contentDigest: digest(value.item.body),
  }));
}

function compileCapabilities(catalog: ContextCatalog, selected: ReadonlyMap<string, SelectedItem>, requested: readonly string[]): CapabilityDecision[] {
  return [...new Set(requested)].sort().map((capability) => {
    const sources = [...selected].flatMap(([ref, value]) => {
      const effect = value.item.capabilities?.[capability];
      return effect === undefined ? [] : [{ ref, effect, rank: rankOf(catalog, value.item) }];
    });
    if (sources.length === 0) return { capability, effect: CAPABILITY_EFFECT.DENY, source: null };
    const topRank = Math.max(...sources.map((source) => source.rank));
    const winners = sources.filter((source) => source.rank === topRank);
    if (new Set(winners.map((winner) => winner.effect)).size !== 1) {
      throw new ContextError(CONTEXT_ERROR.CAPABILITY_CONFLICT, `conflicting rules for capability ${capability}`);
    }
    const winner = winners.sort((left, right) => compareOrdinal(left.ref, right.ref))[0];
    if (winner === undefined) throw new ContextError(CONTEXT_ERROR.CAPABILITY_CONFLICT, `missing winner for capability ${capability}`);
    return { capability, effect: winner.effect, source: winner.ref };
  });
}

function buildReceipt(catalog: ContextCatalog, candidates: ReadonlyMap<string, SelectedItem>, selected: ReadonlyMap<string, SelectedItem>, input: ContextCompileInput): ContextItemReceipt[] {
  const attributes = requestAttributes(input);
  return catalog.items.map((item): ContextItemReceipt => {
    const ref = itemRef(item);
    const winner = selected.get(ref);
    if (winner !== undefined) return { ref, included: true, reason: winner.reason, replacedBy: null };
    if (item.status !== CONTEXT_ITEM_STATUS.ACTIVE) return { ref, included: false, reason: 'inactive', replacedBy: null };
    if (!isApplicable(item, attributes)) return { ref, included: false, reason: SELECTOR_MISMATCH_REASON, replacedBy: null };
    const replacement = [...selected].find(([, value]) => value.item.semanticKey === item.semanticKey)?.[0] ?? null;
    return { ref, included: false, reason: candidates.has(ref) ? 'lower-precedence' : SELECTOR_MISMATCH_REASON, replacedBy: replacement };
  }).sort((left, right) => compareOrdinal(left.ref, right.ref));
}

export function compileContext(catalog: ContextCatalog, input: ContextCompileInput): CompiledContextPack {
  const byRef = indexCatalog(catalog);
  const candidates = selectCandidates(catalog, input, byRef);
  const selected = resolveSemanticConflicts(catalog, candidates);
  const items = compileItems(catalog, selected);
  const capabilities = compileCapabilities(catalog, selected, input.requestedCapabilities);
  const semanticInput = { schemaVersion: CONTEXT_PACK_SCHEMA_VERSION, input, items, capabilities };
  const semanticDigest = digest(semanticInput);
  return {
    schemaVersion: CONTEXT_PACK_SCHEMA_VERSION,
    packId: `CTX-${semanticDigest.slice('sha256:'.length, 'sha256:'.length + 20).toUpperCase()}`,
    role: input.role,
    phase: input.phase,
    items,
    capabilities,
    semanticDigest,
    receipt: buildReceipt(catalog, candidates, selected, input),
  };
}
