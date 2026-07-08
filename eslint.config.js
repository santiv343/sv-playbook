import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const domainLiterals = ['draft', 'ready', 'active', 'review', 'done', 'blocked', 'dropped', 'transition', 'note', 'takeover', 'evidence'];
const singleSourceMessage = "single source: use the constant from the module's .constants.ts";
const testFiles = '**/*.test.ts';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
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
      // Numbers stringify deterministically; forbidding them in templates
      // adds noise without safety. Everything else stays restricted.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // Graduated from user taste - each rule cites its origin.
      // taste: split-before-exceed size discipline
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      // taste: no nested ternary (IIFE-in-ternary pattern)
      'no-nested-ternary': 'error',
      // taste: one responsibility, low branching
      'complexity': ['error', 10],
      'max-depth': ['error', 3],
      // taste: single-source contractual strings (production code)
      'sonarjs/no-duplicate-string': ['error', { threshold: 2 }],
      // taste: cognitive complexity (sonarjs)
      'sonarjs/cognitive-complexity': ['error', 10],
      // taste: no mutable shared state reached via process globals in production code
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
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
