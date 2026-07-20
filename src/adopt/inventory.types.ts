// Lo que inventoryRepo (inventory.ts) recolecta de un repo AJENO antes de
// decidir cómo adoptarlo — playbookArtifacts es el mapa "¿ya tiene esto
// sv-playbook?" (config, AGENTS.md, etc.), separado de GapReport porque acá
// es inventario descriptivo, no un veredicto de gaps.
export interface InventoryReport {
  stack: string[];
  verifyCommand: string | null;
  ci: { workflows: string[] };
  playbookArtifacts: Record<string, boolean>;
  git: { remoteUrl: string | null; defaultBranch: string | null };
  packages: string[];
}
