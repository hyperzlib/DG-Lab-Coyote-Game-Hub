import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts', 'cli/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      indent: 'off',
      '@typescript-eslint/indent': 'off',
    },
  },
);
