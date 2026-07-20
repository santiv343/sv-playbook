// Análogo de git.constants.ts pero para el CLI de GitHub — usado en
// reconcile.ts para leer PRs reales (ver F-003 en findings.md: `gh pr list
// --state all` es el único chequeo confiable de squash-merge, `git
// merge-base --is-ancestor` no alcanza).
export const GH_EXECUTABLE = 'gh';
export const GH_ARGUMENT = {
  JQ: '--jq',
} as const;
