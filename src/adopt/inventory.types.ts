export interface InventoryReport {
  stack: string[];
  verifyCommand: string | null;
  ci: { workflows: string[] };
  playbookArtifacts: Record<string, boolean>;
  git: { remoteUrl: string | null; defaultBranch: string | null };
  packages: string[];
}
