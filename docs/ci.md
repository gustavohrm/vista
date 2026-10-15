---
status: IMPLEMENTED
last_updated: 2026-10-15
scope: Continuous integration, the pinned toolchain, and the checks that report on pull requests.
---

# Continuous integration

`.github/workflows/ci.yml` verifies every pull request and every push to `main`. It runs the same root and package scripts a contributor runs locally, so a green run means those scripts passed rather than some CI-only approximation of them.

## Toolchain

Local and CI runs resolve the same versions, each declared once:

| Where                           | Declares                                              |
| ------------------------------- | ----------------------------------------------------- |
| `package.json` `engines`        | The Node and pnpm range every run must satisfy        |
| `package.json` `packageManager` | The exact pnpm version pnpm installs itself           |
| `.nvmrc`                        | The exact Node version, read by `nvm` and CI          |
| `.npmrc` `engine-strict`        | Makes an install outside `engines` fail               |
| `rust-toolchain.toml`           | The exact Rust version and its `clippy` and `rustfmt` |

CI reads those same files rather than repeating a version: `pnpm/action-setup` takes pnpm from `packageManager`, `actions/setup-node` takes Node from `.nvmrc`, and `rustup toolchain install` takes Rust from `rust-toolchain.toml`. A version is raised in one place, and a machine that cannot satisfy it is told at install time instead of failing later in a way nobody can reproduce.

`rust-toolchain.toml` sits at the repository root rather than in `apps/native/` because rustup resolves it from the working directory, and the Rust scripts run cargo from the package with `--manifest-path`, so the root file applies to every Rust command.

`engine-strict` is deliberate friction. A patch-level difference rarely matters, and the one time it does, the failure looks like a bug in the change under review rather than a difference in the runtime.

## Jobs

| Job    | Runner           | Runs                                                                                                                          |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Web`  | `ubuntu-latest`  | `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm test`, `pnpm build:web`, `pnpm build:native`, `pnpm test:e2e` |
| `Rust` | `windows-latest` | `pnpm --filter=@vista/native` `format:rust:check`, `lint:rust:check`, `test:rust`                                             |

Both jobs run on every pull request and every push to `main`, in parallel. There is no change-based selection: the repository is one application, and a check that skips half of it on a pull request is a check that lets the other half reach `main` unverified.

The `Web` job covers the shared interface in `packages/app` and the web host in `apps/web`, along with the repository-wide format, lint, typecheck, and test scripts. Those parts are platform-independent, so they run on the fastest, cheapest runner. End-to-end tests run Chromium only, through the Playwright configuration in `apps/web`, which builds the web app and starts a local Cloudflare Worker before the tests run.

The `Rust` job runs on Windows because Windows is the platform the native layer is built and used on. It runs the Rust scripts in `apps/native` without building the frontend first, so the `frontendDist` directory is not produced before the Rust checks.

The `Rust` job also sets up Node and the dependencies, because the Rust scripts are run through `pnpm --filter`, which needs the workspace installed.

## Changing the workflow

Prefer adding a script to `package.json` over adding a step to the workflow. A step only CI can run is a step nobody can reproduce before pushing, and that is how CI turns into a second build system.

Workspace setup — pnpm, Node, and a frozen-lockfile install — lives in `.github/actions/setup`, so the two jobs cannot drift apart. `--locked` on the Rust scripts is the Rust half of the same rule: a `Cargo.lock` that disagrees with `Cargo.toml` fails rather than being rewritten in CI.

### Pinning third-party actions

Every action from another repository is referenced by full commit SHA, with the release it corresponds to in a trailing comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is a mutable pointer. `@v5` resolves to whatever its owner last pointed it at, so a compromised or simply retagged release changes what runs here without any change landing in this repository. A SHA cannot move, which turns an action upgrade into a reviewable diff. The comment carries the human-readable version, because a bare SHA says nothing about how far behind it is.

The rule is all or nothing on purpose. Pinning some actions and not others is worse than pinning none: a reader cannot tell a reference that was reviewed from one that was missed. Adding an action means resolving its SHA in the same change.

`./.github/actions/setup` is deliberately not pinned. It is a path in this repository, already versioned by the commit under test.

Nothing updates these automatically. That is the cost of the rule, accepted rather than overlooked: upgrades are manual. Resolve the new SHA with `gh` and update the comment alongside it:

```sh
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

## Labels

`.github/labels.json` is the source for the repository's labels. Each entry is created or updated by:

```sh
node scripts/sync-labels.mjs
```

The script needs an authenticated `gh` for this repository. It writes every label with `gh label create --force`, so a run is safe to repeat and updates colors and descriptions in place. It never deletes a label: a label on GitHub that the list no longer has is printed for a maintainer to remove by hand, because deleting it strips the label from every issue that carries it.

Issue forms in `.github/ISSUE_TEMPLATE` apply `type:*` and `status:needs-triage` labels, so those labels must exist before an issue is filed from a form.

## Branch protection

The workflow reports; it does not block on its own. What blocks is branch protection on GitHub, a repository setting no file here can enforce. The recommended configuration for `main` is:

| Setting                | Recommended value                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Required status checks | `Web` and `Rust`, from the GitHub Actions app, so no other integration can report a passing check under those names |
| Pull requests          | Required before merging                                                                                             |
| Force pushes, deletion | Refused                                                                                                             |

The check names are the job `name:` values in `ci.yml`. If a job is renamed, the required check must be updated to match, or the renamed check will never report as required.

## Not covered yet

- **Releases.** Nothing builds, signs, or publishes native installers in CI.
- **Native builds on macOS, Linux, and mobile.** The `Rust` job checks only Windows. `pnpm --filter=@vista/native build:desktop`, `build:android`, and `build:ios` run from a developer's machine.
- **Native frontend release bundle.** The `Rust` job does not run `tauri build` or a release-profile compile.
