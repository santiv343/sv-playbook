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

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/**/*.mjs'] },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { sonarjs },
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
