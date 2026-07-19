// Shared context precedence order used by context bootstrap scripts.
// A kind with no rank poisons compilation, so this must be set before any
// addContextItem call.
export const CONTEXT_PRECEDENCE = [
  'principle',
  'human-decision',
  'constitutional-invariant',
  'binding-decision',
  'role-constraint',
  'task-requirement',
  'taste-human',
  'human-taste',
  'instance-default',
  'learned-correction',
  'role',
];
