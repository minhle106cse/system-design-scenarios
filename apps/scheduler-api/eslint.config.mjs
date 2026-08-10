// @ts-check
import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/generated/**',
      'generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      // Project uses noImplicitAny:false → any flows through bus handler maps and
      // catch blocks. Align by downgrading rather than suppressing at call sites.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Architectural boundary enforcement (Hexagonal / Clean Architecture).
  // See directives/folder_structure_sop.md + cqrs_pattern.md.
  // Uses @typescript-eslint/no-restricted-imports so `import type` is also caught
  // (a type-only dependency across layers is still a dependency).
  // ───────────────────────────────────────────────────────────────────────────

  // Domain — pure TypeScript. shared-kernel + same-domain relative imports only.
  {
    files: ['src/modules/*/domain/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'fastify',
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                '@/infrastructure/**',
                '@/common/**',
                '@/modules/*/application/**',
                '@/modules/*/infrastructure/**',
                '@/modules/*/presentation/**',
              ],
              message:
                'Domain must be pure TypeScript: shared-kernel + same-domain relative imports only. No framework (NestJS/Fastify), no ORM (Prisma/generated), no outer layer.',
            },
          ],
        },
      ],
    },
  },

  // Application — orchestrates via interfaces. No ORM/HTTP/DB; no HTTP exceptions.
  // The only allowed infrastructure import is @/infrastructure/cqrs (decorators).
  {
    files: ['src/modules/*/application/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/common',
              importNames: [
                'NotFoundException',
                'BadRequestException',
                'ForbiddenException',
                'UnauthorizedException',
                'ConflictException',
                'GoneException',
                'HttpException',
                'InternalServerErrorException',
                'UnprocessableEntityException',
                'NotAcceptableException',
              ],
              message:
                'Application must not throw HTTP exceptions. Use an ApplicationError subclass (common/errors) — GlobalExceptionFilter maps it to a statusCode.',
            },
          ],
          patterns: [
            {
              group: [
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                'fastify',
                '@/infrastructure/database/**',
                '@/infrastructure/http/**',
              ],
              message:
                'Application must not depend on ORM/HTTP/DB. Use a repository interface from domain; the only valid infrastructure import is @/infrastructure/cqrs.',
            },
          ],
        },
      ],
    },
  },

  // Presentation — translate HTTP <-> Command/Query. Never touch the ORM/DB.
  {
    files: ['src/modules/*/presentation/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                '@/infrastructure/database/**',
              ],
              message:
                'Presentation must not touch the ORM/DB directly. Go through CommandBus/QueryBus.',
            },
          ],
        },
      ],
    },
  },

  // Test files — the `jest.Mocked<IRepository>` pattern `directives/testing_standard.md`
  // §2 prescribes mocks interfaces whose methods use TS method-shorthand syntax
  // (every repository interface in this repo does, matching shared-kernel's
  // ILogger/ITxRunner style). Two type-aware rules misfire specifically on
  // that pattern and nowhere else worth keeping strict:
  //  - `no-unnecessary-type-assertion` sees `{...} as unknown as jest.Mocked<T>`
  //    as redundant, because a plain object of `jest.fn()`s is ALREADY
  //    structurally assignable to `jest.Mocked<T>` — true only in the
  //    narrow, deliberate case of a test double, not evidence the cast is dead.
  //  - `unbound-method` flags `expect(mock.someMethod).toHaveBeenCalledWith(...)`
  //    because `jest.Mocked<T>`'s mapped type still carries the ORIGINAL
  //    method-shorthand signature (with its implicit `this`) intersected in —
  //    even though the reference is inside `expect(...)`, never invoked
  //    unbound. `eslint-plugin-jest`'s `jest/unbound-method` exists to special-
  //    case exactly this and isn't a dependency here; disabling the base rule
  //    for spec files is the equivalent fix without adding a package for it.
  {
    files: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  // common — cross-cutting abstractions only. shared-kernel + relative.
  {
    files: ['src/common/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/modules/**',
                '@/infrastructure/**',
                '@nestjs/*',
                'fastify',
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
              ],
              message:
                'common/ holds cross-cutting abstractions only: shared-kernel + relative imports. No modules/, no infrastructure/, no framework, no ORM.',
            },
          ],
        },
      ],
    },
  },
)
