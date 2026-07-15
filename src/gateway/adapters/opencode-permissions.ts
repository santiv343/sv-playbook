import { ContextError } from '../../context/context.errors.js';
import type { ExecutionProfile } from '../gateway.types.js';
import { OPENCODE_PERMISSION, OPENCODE_PERMISSION_ACTION } from './opencode.constants.js';

interface PermissionRule {
  permission: string;
  pattern: string;
  action: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRuleString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContextError('INVALID_ADAPTER_RESPONSE', `${label} must be a string`);
  }
  return value;
}

function permissionRules(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) throw new ContextError('INVALID_ADAPTER_RESPONSE', 'agent permissions must be an array');
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new ContextError('INVALID_ADAPTER_RESPONSE', 'agent permission must be an object');
    }
    return {
      permission: requiredRuleString(entry.permission, 'permission name'),
      pattern: requiredRuleString(entry.pattern, 'permission pattern'),
      action: requiredRuleString(entry.action, 'permission action'),
    };
  });
}

function defaultDenyIndex(rules: readonly PermissionRule[]): number {
  let result = -1;
  for (const [index, rule] of rules.entries()) {
    const isDefaultDeny = rule.permission === OPENCODE_PERMISSION.WILDCARD
      && rule.pattern === OPENCODE_PERMISSION.WILDCARD
      && rule.action === OPENCODE_PERMISSION_ACTION.DENY;
    if (isDefaultDeny) result = index;
  }
  return result;
}

function enabledToolIds(profile: ExecutionProfile): ReadonlySet<string> {
  return new Set(Object.entries(profile.tools).filter(([, enabled]) => enabled).map(([toolId]) => toolId));
}

function verifyNoUndeclaredAllows(
  rules: readonly PermissionRule[],
  firstAgentRule: number,
  enabledTools: ReadonlySet<string>,
  agentId: string,
): void {
  const controlPermissions: ReadonlySet<string> = new Set<string>([OPENCODE_PERMISSION.EXTERNAL_DIRECTORY]);
  const undeclared = rules.slice(firstAgentRule).find((rule) => (
    rule.action === OPENCODE_PERMISSION_ACTION.ALLOW
    && !enabledTools.has(rule.permission)
    && !controlPermissions.has(rule.permission)
  ));
  if (undeclared !== undefined) {
    throw new ContextError(
      'AGENT_TOOL_POLICY_MISMATCH',
      `OpenCode agent ${agentId} allows undeclared permission ${undeclared.permission}`,
    );
  }
}

function effectiveBroadAction(rules: readonly PermissionRule[], toolId: string): string | undefined {
  return rules.filter((rule) => (
    (rule.permission === OPENCODE_PERMISSION.WILDCARD || rule.permission === toolId)
    && rule.pattern === OPENCODE_PERMISSION.WILDCARD
  )).at(-1)?.action;
}

export function verifyOpenCodeToolPermissions(value: unknown, profile: ExecutionProfile): void {
  const rules = permissionRules(value);
  const denyIndex = defaultDenyIndex(rules);
  if (denyIndex < 0) {
    throw new ContextError('AGENT_TOOL_POLICY_MISMATCH', `OpenCode agent ${profile.agentId} is not default-deny`);
  }
  const enabledTools = enabledToolIds(profile);
  verifyNoUndeclaredAllows(rules, denyIndex + 1, enabledTools, profile.agentId);
  const unavailable = [...enabledTools].find((toolId) => (
    effectiveBroadAction(rules, toolId) !== OPENCODE_PERMISSION_ACTION.ALLOW
  ));
  if (unavailable !== undefined) {
    throw new ContextError(
      'AGENT_TOOL_POLICY_MISMATCH',
      `OpenCode agent ${profile.agentId} does not allow declared tool ${unavailable}`,
    );
  }
}
