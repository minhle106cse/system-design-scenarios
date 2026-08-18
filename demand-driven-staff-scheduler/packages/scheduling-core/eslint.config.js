// Enforces the one rule that defines this package (plan §2.1): zero runtime dependencies.
// Adding an import from any framework the rest of the repo uses fails lint here, on purpose.
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const FORBIDDEN = [
  'react',
  'react-dom',
  'next',
  'next/*',
  '@prisma/client',
  '.prisma/*',
  'zod',
];

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: FORBIDDEN.filter((p) => !p.includes('*')).map((name) => ({
            name,
            message: `${name} is not allowed in packages/scheduling-core (plan §2.1: zero runtime dependencies).`,
          })),
          patterns: FORBIDDEN.filter((p) => p.includes('*')).map((pattern) => ({
            group: [pattern],
            message: `${pattern} is not allowed in packages/scheduling-core (plan §2.1: zero runtime dependencies).`,
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'No process.env in scheduling-core (plan §2.1).' },
      ],
    },
  },
];
