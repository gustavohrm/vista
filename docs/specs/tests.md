# Testing specification

**Status:** APPROVED
**Last updated:** 2026-08-13

This document outlines the testing strategy, architecture, and standards for this repository. It defines test categories, tooling, configuration requirements, and code coverage targets.

## Philosophy

- **Test Behavior, Not Implementation**: Write tests that verify the observable behavior of your API or component, rather than its internal implementation details.
- **Fast and Deterministic**: Tests must run quickly and yield consistent, predictable results. Flaky tests are unacceptable.
- **Fail Fast**: Test inputs and edge cases early. Ensure error paths are tested alongside happy paths.

## Test Categorization

Tests in this repository use the following categories as needed, based on scope and isolation level.

### 1. Unit Tests

Unit tests verify the correctness of small, isolated blocks of code (such as individual functions, classes, or hooks) in isolation.

- **Location**: Colocated in the same directory as the source code they verify.
- **File Naming**: `[filename].test.ts` or `[filename].test.tsx` (e.g., `src/normalize.test.ts`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Mock external dependencies (network APIs, local storage, databases, file system, timers, and browser-specific globals).
  - Do not cross-import test utilities across distant packages unless exposed via explicit shared test packages.
  - SHOULD run on every pull request once continuous integration is configured.

### 2. Integration Tests

Integration tests verify that multiple modules or packages interact correctly, including boundaries such as database adapters, network middleware, or cache layers.

- **Location**: Housed in a `tests/integration/` directory inside the package or application root (e.g., `packages/app/tests/integration/`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Do not use a repository-root global `tests/` directory by default. Keep tests colocated within the package/app scope.
  - Do not create a hard rule banning global repository-level integration directories if complex, multi-package orchestration tests become necessary in the future.

### 3. End-to-End (E2E) & Visual Tests

E2E tests verify full user journeys, page transitions, rendering, and visual regression across real browser environments.

- **Location**: Housed in `tests/e2e/` or `tests/browser/` directories within the target application or specialized styling packages.
- **Tooling**: [Playwright](https://playwright.dev/).
- **Conventions**:
  - Use visual regression testing for style sheets and components to capture visual changes before merge.
  - Since E2E tests are slower and require browser environments, configure them separately to avoid blocking fast unit test loops.

## Configuration Requirements

To maintain clean and explicit testing setups, follow these configuration rules:

- **Config Files**:
  - If a package or application requires custom options (such as path aliases, environment variables, vitest plugins, or specific setups), it **MUST** include an explicit configuration file (`vite.config.ts`, `vitest.config.ts`, or `playwright.config.ts`).
  - Do not rely on implicit or undocumented fallback behavior.
- **Package Scripts**:
  - Every testable package or app `package.json` must expose standard test scripts:
    - `"test"`: Runs tests once.
    - `"test:watch"`: Runs tests in interactive watch mode.
    - `"test:coverage"`: Runs tests and outputs a coverage report.

## Code Coverage

- **Suggested Target**: **80%** code coverage.
- **Non-Blocking Target**: Code coverage is a target to guide development and review discussions. It must not block the CI/CD pipeline or fail builds due to minor discrepancies, preventing false-positive failures and unnecessary development overhead.

## Execution Commands

Always run tests from the repository root:

### Workspace-wide Checks

```sh
pnpm test
pnpm test:coverage
```

### Package-filtered Checks

Prefer using package-filtered commands when testing a single package or to avoid workspace timeouts:

```sh
pnpm --filter=<package-name> test
pnpm --filter=<package-name> test:watch
pnpm --filter=<package-name> test:coverage
```

_(Replace `<package-name>` with a workspace package name, e.g., `pnpm --filter=@vista/app test`.)_
