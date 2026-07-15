import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const DEFAULTS = { maxLines: 350, maxLinesPerFunction: 60, complexity: 10, cognitiveComplexity: 10, layout: true };

function positiveInt(raw, fallback) {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

function gatesFromRaw(raw) {
  return {
    maxLines: positiveInt(raw.maxLines, DEFAULTS.maxLines),
    maxLinesPerFunction: positiveInt(raw.maxLinesPerFunction, DEFAULTS.maxLinesPerFunction),
    complexity: positiveInt(raw.complexity, DEFAULTS.complexity),
    cognitiveComplexity: positiveInt(raw.cognitiveComplexity, DEFAULTS.cognitiveComplexity),
    layout: typeof raw.layout === 'boolean' ? raw.layout : DEFAULTS.layout,
  };
}

function readGates() {
  try {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, 'playbook.config.json'), 'utf8'));
    return raw && raw.gates && typeof raw.gates === 'object' ? gatesFromRaw(raw.gates) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const gates = readGates();

const domainLiterals = ['draft', 'ready', 'active', 'review', 'done', 'blocked', 'dropped', 'transition', 'note', 'takeover', 'evidence'];
const singleSourceMessage = "single source: use the constant from the module's .constants.ts";
const testFiles = '**/*.test.ts';
const stringComparisonOperators = new Set(['===', '!==', '==', '!=']);
const stringComparisonMethods = new Set(['endsWith', 'has', 'includes', 'indexOf', 'lastIndexOf', 'localeCompare', 'startsWith']);
const typeofResults = new Set(['bigint', 'boolean', 'function', 'number', 'object', 'string', 'symbol', 'undefined']);
const structuralStringSentinel = /^(?:|\d+)$/;

function stringLiteral(node) {
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function isTypeofComparison(node, value) {
  const other = stringLiteral(node.left) === value ? node.right : node.left;
  return other.type === 'UnaryExpression' && other.operator === 'typeof' && typeofResults.has(value);
}

function reportStringLiteral(context, node) {
  const value = stringLiteral(node);
  if (value === undefined || structuralStringSentinel.test(value)) return;
  context.report({ node, messageId: 'useConstant', data: { value } });
}

function memberMethodName(callee) {
  if (callee.type !== 'MemberExpression') return undefined;
  if (!callee.computed && callee.property.type === 'Identifier') return callee.property.name;
  return stringLiteral(callee.property);
}

function comparisonCollection(callee) {
  if (callee.type !== 'MemberExpression') return undefined;
  if (callee.object.type === 'ArrayExpression') return callee.object;
  if (callee.object.type !== 'NewExpression' || callee.object.callee.type !== 'Identifier') return undefined;
  if (callee.object.callee.name !== 'Set') return undefined;
  const first = callee.object.arguments[0];
  return first?.type === 'ArrayExpression' ? first : undefined;
}

function reportCallArguments(context, node) {
  for (const argument of node.arguments) {
    if (argument.type !== 'SpreadElement') reportStringLiteral(context, argument);
  }
}

function reportCollectionElements(context, callee) {
  const collection = comparisonCollection(callee);
  for (const element of collection?.elements ?? []) {
    if (element !== null && element.type !== 'SpreadElement') reportStringLiteral(context, element);
  }
}

const playbookRules = {
  'no-string-literal-comparison': {
    meta: {
      type: 'problem',
      schema: [{
        type: 'object',
        properties: { checkMethods: { type: 'boolean' } },
        additionalProperties: false,
      }],
      messages: { useConstant: "Compare against a named constant or enum member, never the string literal '{{value}}'." },
    },
    create(context) {
      const checkMethods = context.options[0]?.checkMethods !== false;
      return {
        BinaryExpression(node) {
          if (!stringComparisonOperators.has(node.operator)) return;
          const value = stringLiteral(node.left) ?? stringLiteral(node.right);
          if (value === undefined || structuralStringSentinel.test(value) || isTypeofComparison(node, value)) return;
          context.report({ node, messageId: 'useConstant', data: { value } });
        },
        SwitchCase(node) {
          if (node.test !== null) reportStringLiteral(context, node.test);
        },
        CallExpression(node) {
          if (!checkMethods) return;
          const method = memberMethodName(node.callee);
          if (method === undefined || !stringComparisonMethods.has(method)) return;
          reportCallArguments(context, node);
          reportCollectionElements(context, node.callee);
        },
      };
    },
  },
};

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/**/*.mjs', '.worktrees/'] },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { sonarjs, playbook: { rules: playbookRules } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: ['test', 'suite', 'describe', 'it'], package: 'node:test' },
          ],
        },
      ],
      'max-lines': ['error', { max: gates.maxLines, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: gates.maxLinesPerFunction, skipBlankLines: true, skipComments: true }],
      'no-nested-ternary': 'error',
      'complexity': ['error', gates.complexity],
      'max-depth': ['error', 3],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'sonarjs/no-duplicate-string': ['error', { threshold: 2 }],
      'sonarjs/cognitive-complexity': ['error', gates.cognitiveComplexity],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:sqlite'],
              message:
                'CLI is the sole interface: direct DB access is forbidden outside src/db/** (PRINCIPLE-012)',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'chdir', message: 'pass directories as parameters instead' },
      ],
      'no-restricted-syntax': [
        'error',
        ...domainLiterals.map((value) => ({
          selector: `Literal[value='${value}']`,
          message: singleSourceMessage,
        })),
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'content/ui/**/*.js'],
    rules: {
      'playbook/no-string-literal-comparison': 'error',
    },
  },
  {
    files: ['src/schema/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
  {
    files: ['**/*.constants.ts', '**/*.types.ts', testFiles],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: [testFiles],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-properties': 'off',
      'playbook/no-string-literal-comparison': ['error', { checkMethods: false }],
    },
  },
  {
    files: ['src/db/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/config.ts', 'src/db/store.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
          message: 'JSON.parse is forbidden outside src/schema/. Use schema validation instead.',
        },
        ...domainLiterals.map((value) => ({
          selector: `Literal[value='${value}']`,
          message: singleSourceMessage,
        })),
      ],
    },
  },
);
