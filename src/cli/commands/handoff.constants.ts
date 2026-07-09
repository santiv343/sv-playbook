export const HANDOFF_ROLE_DEFAULT = 'orchestrator';

export function rolePointers(role: string): string {
  return `You are taking over as ${role}. Read first: AGENTS.md, then \`sv-playbook docs roles/${role}\`, \`docs review\`, \`docs principles\`.`;
}

export function nextActionAndCounts(packetsByStatus: Map<string, string[]>): string {
  if (packetsByStatus.get('review')?.length) {
    return 'Next: delegate a reviewer for packet(s) in review.';
  }
  const ready = packetsByStatus.get('ready');
  if (ready && ready.length > 0 && !packetsByStatus.get('active')?.length) {
    const ids = ready.join(', ');
    return `Next: dispatch a worker for ready packet(s): ${ids}.`;
  }
  if (packetsByStatus.get('active')?.length) {
    const ids = packetsByStatus.get('active')!.join(', ');
    return `Next: inspect active packet(s): ${ids}. Check leases for staleness.`;
  }
  if (packetsByStatus.get('blocked')?.length) {
    const ids = packetsByStatus.get('blocked')!.join(', ');
    return `Next: unblock packet(s): ${ids}.`;
  }
  const hasAny = [...packetsByStatus.values()].some((v) => v.length > 0);
  if (!hasAny) {
    return 'Next: board is empty. Report to the human for direction.';
  }
  return 'Next: all packets are done. Report to the human for direction.';
}
