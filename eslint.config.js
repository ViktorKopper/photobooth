import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      // An empty catch is a deliberate choice all over this app — audio,
      // haptics, storage and notifications are all garnish that must never
      // break a capture. The rule stays on so they have to be *written* as
      // empty rather than swallowing a named error by accident.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  {
    files: ['src/**/*.test.js', 'src/test-setup.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },

  {
    files: ['public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.serviceworker }
    }
  }
];
