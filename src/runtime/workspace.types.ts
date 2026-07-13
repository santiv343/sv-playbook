export interface WorkspacePort {
  canonicalWorkspaceRoot(cwd: string): string | null;
  workspaceIdentity(root: string): string | null;
  sameWorkspace(a: string, b: string): boolean;
}
