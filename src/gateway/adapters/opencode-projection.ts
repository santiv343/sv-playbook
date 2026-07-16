import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdapterRoleProjection } from '../../check/catalog-closure.types.js';
import type { ExecutionProfile } from '../gateway.types.js';
import { adapterConfig } from './opencode.js';
import {
  OPENCODE_ADAPTER_ID,
  OPENCODE_API_PATH,
  OPENCODE_PERMISSION,
  OPENCODE_PERMISSION_ACTION,
} from './opencode.constants.js';
import { verifyOpenCodeToolPermissions } from './opencode-permissions.js';
import type { RoleProjectionAdapter, RoleProjectionDraft } from './role-projection.types.js';

const OPENCODE_CONFIG_FILE = 'opencode.json';
const OPENCODE_SCHEMA = 'https://opencode.ai/config.json';
const MANAGED_DESCRIPTION_PREFIX = 'Runtime-managed execution profile for';

interface EffectiveProjectionResult {
  agentIds: string[];
  violations: string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function readConfig(repoRoot: string): Record<string, unknown> {
  const path = join(repoRoot, OPENCODE_CONFIG_FILE);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const config = record(parsed);
  if (config === undefined) throw new TypeError(`${OPENCODE_CONFIG_FILE} must contain an object`);
  return config;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a string`);
  return value;
}

function endpoint(baseUrl: string, path: string, repoRoot: string): string {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('directory', repoRoot);
  return url.toString();
}

async function responseJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new TypeError(`${label} returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  return value;
}

async function verifyEffectiveHealth(baseUrl: string, config: ReturnType<typeof adapterConfig>): Promise<void> {
  const health = record(await responseJson(`${baseUrl}${OPENCODE_API_PATH.HEALTH}`, 'OpenCode health'));
  if (health?.healthy !== true) throw new TypeError('OpenCode is not healthy');
  const version = requiredString(health.version, 'OpenCode version');
  if (!config.allowedVersions.includes(version)) throw new TypeError(`OpenCode ${version} is not allowed`);
}

async function verifyEffectiveTools(baseUrl: string, repoRoot: string, profile: ExecutionProfile): Promise<void> {
  const rawTools = await responseJson(endpoint(baseUrl, OPENCODE_API_PATH.TOOL_IDS, repoRoot), 'OpenCode tools');
  if (!Array.isArray(rawTools) || rawTools.some((tool) => typeof tool !== 'string')) {
    throw new TypeError('OpenCode tools must be a string array');
  }
  const missingTools = rawTools.filter((tool): tool is string => typeof tool === 'string')
    .filter((tool) => !Object.hasOwn(profile.tools, tool));
  if (missingTools.length > 0) throw new TypeError(`tool policy is missing ${missingTools.sort().join(', ')}`);
}

async function effectiveAgent(baseUrl: string, repoRoot: string, profile: ExecutionProfile): Promise<Record<string, unknown>> {
  const rawAgents = await responseJson(endpoint(baseUrl, OPENCODE_API_PATH.AGENT, repoRoot), 'OpenCode agents');
  if (!Array.isArray(rawAgents)) throw new TypeError('OpenCode agents must be an array');
  const agent = rawAgents.map(record).find((candidate) => candidate?.name === profile.agentId);
  if (agent === undefined) throw new TypeError(`effective agent is missing: ${profile.agentId}`);
  return agent;
}

function verifyEffectiveAgent(agent: Record<string, unknown>, profile: ExecutionProfile): void {
  const model = record(agent.model);
  if (model?.providerID !== profile.providerId || model.modelID !== profile.modelId) {
    throw new TypeError(`effective model does not match ${profile.providerId}/${profile.modelId}`);
  }
  verifyOpenCodeToolPermissions(agent.permission, profile);
}

async function effectiveProfile(repoRoot: string, profile: ExecutionProfile): Promise<string[]> {
  // Parse with the adapter's own validator first: whatever the runtime requires
  // (baseUrl, allowedVersions, outputMode) the check surfaces before any fetch.
  const config = adapterConfig(profile);
  await verifyEffectiveHealth(config.baseUrl, config);
  await verifyEffectiveTools(config.baseUrl, repoRoot, profile);
  verifyEffectiveAgent(await effectiveAgent(config.baseUrl, repoRoot, profile), profile);
  return [profile.agentId];
}

function effectiveSuccess(agentIds: string[]): EffectiveProjectionResult {
  return { agentIds, violations: [] };
}

function effectiveFailure(profile: ExecutionProfile, error: unknown): EffectiveProjectionResult {
  const message = error instanceof Error ? error.message : String(error);
  return { agentIds: [], violations: [`${OPENCODE_ADAPTER_ID}:${profile.agentId}: ${message}`] };
}

async function inspectEffective(repoRoot: string, profiles: readonly ExecutionProfile[]): Promise<AdapterRoleProjection> {
  const results = await Promise.all(profiles.map(async (profile) => {
    try {
      return effectiveSuccess(await effectiveProfile(repoRoot, profile));
    } catch (error) {
      return effectiveFailure(profile, error);
    }
  }));
  return {
    adapterId: OPENCODE_ADAPTER_ID,
    agentIds: results.flatMap((result) => result.agentIds).sort(),
    violations: results.flatMap((result) => result.violations).sort(),
  };
}

function permissionProjection(profile: ExecutionProfile): Record<string, string> {
  const permissions: Record<string, string> = { [OPENCODE_PERMISSION.WILDCARD]: OPENCODE_PERMISSION_ACTION.DENY };
  for (const [toolId, enabled] of Object.entries(profile.tools).sort(([left], [right]) => left.localeCompare(right))) {
    permissions[toolId] = enabled ? OPENCODE_PERMISSION_ACTION.ALLOW : OPENCODE_PERMISSION_ACTION.DENY;
  }
  return permissions;
}

function agentProjection(profile: ExecutionProfile): Record<string, unknown> {
  const result: Record<string, unknown> = {
    description: `${MANAGED_DESCRIPTION_PREFIX} ${profile.roleId}. Semantic context is injected per run.`,
    mode: 'all',
    model: `${profile.providerId}/${profile.modelId}`,
    permission: permissionProjection(profile),
  };
  if (profile.variant !== undefined) result.variant = profile.variant;
  return result;
}

function projectedToolViolations(
  permissions: Readonly<Record<string, unknown>>,
  profile: ExecutionProfile,
  prefix: string,
): string[] {
  return Object.entries(profile.tools).flatMap(([toolId, enabled]) => {
    const expected = enabled ? OPENCODE_PERMISSION_ACTION.ALLOW : OPENCODE_PERMISSION_ACTION.DENY;
    return permissions[toolId] === expected ? [] : [`${prefix}: permission mismatch for ${toolId}`];
  });
}

function undeclaredPermissionViolations(
  permissions: Readonly<Record<string, unknown>>,
  profile: ExecutionProfile,
  prefix: string,
): string[] {
  return Object.entries(permissions)
    .filter(([permissionId, action]) => permissionId !== OPENCODE_PERMISSION.WILDCARD
      && !Object.hasOwn(profile.tools, permissionId) && action === OPENCODE_PERMISSION_ACTION.ALLOW)
    .map(([permissionId]) => `${prefix}: undeclared permission ${permissionId} is allowed`);
}

function profileViolations(agent: Record<string, unknown>, profile: ExecutionProfile): string[] {
  const prefix = `${OPENCODE_ADAPTER_ID}:${profile.agentId}`;
  const modelViolations = agent.model === `${profile.providerId}/${profile.modelId}`
    ? [] : [`${prefix}: model projection mismatch`];
  const permissions = record(agent.permission);
  if (permissions === undefined) return [...modelViolations, `${prefix}: permission projection missing`];
  const defaultDenyViolations = permissions[OPENCODE_PERMISSION.WILDCARD] === OPENCODE_PERMISSION_ACTION.DENY
    ? [] : [`${prefix}: projection is not default-deny`];
  return [
    ...modelViolations,
    ...defaultDenyViolations,
    ...projectedToolViolations(permissions, profile, prefix),
    ...undeclaredPermissionViolations(permissions, profile, prefix),
  ];
}

function inspectConfig(config: Record<string, unknown>, profiles: readonly ExecutionProfile[]): AdapterRoleProjection {
  const agents = record(config.agent) ?? {};
  const agentIds = Object.keys(agents).sort();
  const violations = profiles.flatMap((profile) => {
    const agent = record(agents[profile.agentId]);
    return agent === undefined ? [] : profileViolations(agent, profile);
  }).sort();
  return { adapterId: OPENCODE_ADAPTER_ID, agentIds, violations };
}

function compiledConfig(current: Record<string, unknown>, profiles: readonly ExecutionProfile[]): Record<string, unknown> {
  const agents = Object.fromEntries([...profiles]
    .sort((left, right) => left.agentId.localeCompare(right.agentId))
    .map((profile) => [profile.agentId, agentProjection(profile)]));
  return {
    ...current,
    $schema: typeof current.$schema === 'string' ? current.$schema : OPENCODE_SCHEMA,
    permission: {
      [OPENCODE_PERMISSION.WILDCARD]: OPENCODE_PERMISSION_ACTION.DENY,
      [OPENCODE_PERMISSION.EXTERNAL_DIRECTORY]: OPENCODE_PERMISSION_ACTION.DENY,
    },
    agent: agents,
  };
}

export function createOpenCodeRoleProjectionAdapter(): RoleProjectionAdapter {
  return {
    id: OPENCODE_ADAPTER_ID,
    inspect(repoRoot, profiles): AdapterRoleProjection {
      return inspectConfig(readConfig(repoRoot), profiles);
    },
    inspectEffective(repoRoot, profiles): Promise<AdapterRoleProjection> {
      return inspectEffective(repoRoot, profiles);
    },
    compile(repoRoot, profiles): RoleProjectionDraft {
      const config = compiledConfig(readConfig(repoRoot), profiles);
      const projection = inspectConfig(config, profiles);
      return {
        ...projection,
        artifacts: [{ targetPath: join(repoRoot, OPENCODE_CONFIG_FILE), content: `${JSON.stringify(config, null, 2)}\n` }],
      };
    },
  };
}
