import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/generated/**',
      '**/.angular/**',
      '**/*.conf.cjs',
      '**/dist/**',
      '**/node_modules/**',
      'prototype/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.config.cjs',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
