---
status: IMPLEMENTED
last_updated: 2026-11-13
scope: Continuous integration, the pinned toolchain, action pinning, dependency updates, and the checks that report on pull requests.
---

# Continuous integration

`.github/workflows/ci.yml` verifies every pull request, every merge-queue check, and every push to `main`. It runs the same root and package scripts a contributor runs locally, so a green run means those scripts passed rather than some CI-only approximation of them. It runs what `pnpm verify` runs, and the end-to-end tests besides. [Workspace](workspace.md) says what each check guarantees.

## Toolchain

Local and CI runs resolve the same versions, each declared once; [Workspace](workspace.md#toolchain) lists where.

CI reads those same files rather than repeating a version: `pnpm/action-setup` takes pnpm from `packageManager`, `actions/setup-node` takes Node from `.nvmrc`, and `rustup toolchain install` takes Rust from `rust-toolchain.toml`. A version is raised in one place, and a machine that cannot satisfy it is told at install time instead of failing later in a way nobody can reproduce.

`rust-toolchain.toml` sits at the repository root rather than in `apps/native/` because rustup resolves it from the working directory, and the Rust scripts run cargo from the package with `--manifest-path`, so the root file applies to every Rust command.

`engineStrict` is deliberate friction. A patch-level difference rarely matters, and the one time it does, the failure looks like a bug in the change under review rather than a difference in the runtime. It is set in `pnpm-workspace.yaml` because pnpm 11 ignores `engine-strict` in `.npmrc`, where it used to be: `pnpm config get engine-strict` printed `undefined`, and an install outside `engines` only warned.

## Jobs

| Job                 | Runner           | Runs                                                                                                                                                                               |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Web`               | `ubuntu-latest`  | `pnpm versions:check`, `pnpm format:check`, `pnpm lint:check`, `pnpm typecheck`, `pnpm test`, `pnpm build:web`, `pnpm build:native`, `pnpm test:e2e`, then `Working tree is clean` |
| `Rust`              | `windows-latest` | `pnpm --filter=@vista/native` `format:rust:check`, `lint:rust:check`, then `Working tree is clean`                                                                                 |
| `Desktop (Windows)` | `windows-latest` | `pnpm --filter=@vista/native build:desktop`, then `Working tree is clean`, then uploads the NSIS installer                                                                         |
| `Desktop (Linux)`   | `ubuntu-22.04`   | `pnpm --filter=@vista/native lint:rust:check`, `build:desktop`, then `Working tree is clean`, then uploads the `.deb`, `.rpm`, and AppImage                                        |

Every job runs on every pull request, every merge-queue check, and every push to `main`, in parallel. There is no change-based selection: the repository is one application, and a check that skips half of it on a pull request is a check that lets the other half reach `main` unverified.

The `Web` job covers the shared interface in `packages/app` and the web host in `apps/web`, along with the repository-wide format, lint, typecheck, and test scripts. Those parts are platform-independent, so they run on the fastest, cheapest runner. End-to-end tests run Chromium only, through the Playwright configuration in `apps/web`, which builds the web app and starts a local Cloudflare Worker before the tests run.

The `Rust` job runs on Windows because Windows is the platform the native layer is built and used on. It runs the Rust scripts in `apps/native` without building the frontend first, so the `frontendDist` directory is not produced before the Rust checks.

The `Rust` job also sets up Node and the dependencies, because the Rust scripts are run through `pnpm --filter`, which needs the workspace installed.

The `Desktop` jobs build the installers a release ships, with `tauri build` in the release profile, so a change that breaks bundling fails its pull request instead of a release. They are the slowest jobs, and run beside the others rather than after them. Windows is the primary desktop platform and Linux the second; macOS is not built. The Linux job runs on the oldest supported Ubuntu, because an AppImage runs only on systems whose glibc is at least as new as the one it was built against, and installs WebKitGTK 4.1 and the libraries Tauri's Linux bundles need. It also runs Clippy, which the `Rust` job runs only on Windows, so code that compiles only there is caught. Each job uploads its installers as a workflow artifact kept for seven days, so a change can be tried before it merges; they are unsigned, and are not releases.

`Working tree is clean`, the last step of each job, fails when a check has left a tracked or untracked file changed. A check that writes has changed what it was checking, so it is reported rather than passing. On the Windows runner the step runs under `bash`, so both jobs run the same command.

Runs for the same pull request cancel each other, because only the newest push is worth a verdict. A merge-queue run or a push to `main` is never cancelled to make way for a newer one: each is the authoritative check of a commit, so each is grouped by its commit rather than its branch. Grouping by branch would not hold that: a concurrency group holds one running and one pending run, and GitHub cancels the pending one when a third arrives, whatever `cancel-in-progress` says, so three quick pushes to `main` would leave the second without a verdict. The cost is that runs on `main` can run in parallel. The `merge_group` trigger never fires while the repository has no merge queue. Requiring one would make the `push` trigger redundant: the queue lands the exact commit it checked, so a push run would only repeat a passed check. The workflow's token is read-only (`permissions: contents: read`); a job that needs more asks for it on that job alone.

## Releases

`.github/workflows/release.yml` publishes a release when a tag named `v` and the version, such as `v0.2.0`, is pushed. It runs one release at a time and never cancels one halfway.

1. `Check the tag` runs `scripts/check-versions.mjs` and fails unless the tag names the version in `package.json`.
2. `Build (Windows)` and `Build (Linux)` run `tauri build` with `createUpdaterArtifacts`, signing each updater artifact with the private key. Windows ships the NSIS installer only; Linux ships the `.deb`, `.rpm`, and AppImage.
3. `Publish` writes `latest.json` with `scripts/release-manifest.mjs`, which fails before anything is uploaded when an installer or its `.sig` is missing. It uploads the installers to the R2 bucket under the version's folder, deploys the web app, and only then uploads `latest.json`, so a client is never told about files the Worker cannot serve. Last, `scripts/release-retention.mjs` deletes old releases.

The Worker in `apps/web` serves the bucket: `/releases/latest.json` for the updater, `/releases/<version>/<file>` for the files, and `/download/windows` and `/download/linux` as links to the current installer. The web app and the desktop releases therefore move together: the Worker is deployed by a release, not by a merge to `main`.

The updater installs the NSIS installer on Windows and the AppImage on Linux. A `.deb` or `.rpm` install is updated by downloading the new package. MSI is not built: WiX fails where VBScript is unavailable, which Windows 11 is removing. If MSI is added later, it is an extra download only; the updater keeps serving NSIS, because NSIS installs per user and MSI per machine, and switching an install from one to the other would leave two copies.

**Retention.** The bucket stays inside the R2 free tier by keeping few releases. Before 1.0, only the version just published is kept. From 1.0 on, every release of the newest major is kept and older majors are deleted. A version newer than the one published is never deleted, and a folder whose name is not a version is left alone. Retention runs after `latest.json` points at the new version, so an updater that started downloading the previous version a moment before can get a 404; it offers the update again on the next start.

**Secrets** live in the `release` environment, not in repository secrets, so only the release jobs can read them. The environment allows deployments from tags matching `v*` only, so a workflow on a branch cannot reach them either. Create it under Settings, Environments, set Deployment branches and tags to "Selected branches and tags" with the tag rule `v*`, and add:

| Secret                               | Holds                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | The updater's private signing key; the public key is in `tauri.conf.json`     |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password                                                                  |
| `CLOUDFLARE_API_TOKEN`               | A token with Workers Scripts Edit and Workers R2 Storage Write on the account |
| `CLOUDFLARE_ACCOUNT_ID`              | The Cloudflare account the Worker and bucket belong to                        |

The bucket name, `vista-releases`, is in `release.yml` and `apps/web/wrangler.json`; change both together. Losing the private key means installed apps can never be updated again, only reinstalled, so keep a copy outside GitHub.

## Changing the workflow

Prefer adding a script to `package.json` over adding a step to the workflow. A step only CI can run is a step nobody can reproduce before pushing, and that is how CI turns into a second build system.

Workspace setup — pnpm, Node, and a frozen-lockfile install — lives in `.github/actions/setup`, so the jobs cannot drift apart. `--locked` on the Rust scripts is the Rust half of the same rule: a `Cargo.lock` that disagrees with `Cargo.toml` fails rather than being rewritten in CI.

### Pinning third-party actions

Every action from another repository is referenced by full commit SHA, with the release it corresponds to in a trailing comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is a mutable pointer. `@v5` resolves to whatever its owner last pointed it at, so a compromised or simply retagged release changes what runs here without any change landing in this repository. A SHA cannot move, which turns an action upgrade into a reviewable diff. The comment carries the human-readable version, because a bare SHA says nothing about how far behind it is.

The rule is all or nothing on purpose. Pinning some actions and not others is worse than pinning none: a reader cannot tell a reference that was reviewed from one that was missed. Adding an action means resolving its SHA in the same change. The repository's Actions settings can enforce the rule, refusing any workflow that references another repository's action by anything but a full SHA; that setting is dashboard state, turned on by hand, and is on for this repository.

`./.github/actions/setup` is deliberately not pinned. It is a path in this repository, already versioned by the commit under test.

For a hand upgrade, resolve the new SHA with `gh` and update the comment alongside it:

```sh
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

## Dependency updates

`.github/dependabot.yml` proposes weekly updates for the GitHub Actions, including the composite action under `.github/actions/`, for the npm dependencies in the workspace, and for the Rust crates in `apps/native/src-tauri`. It moves an action's SHA and its version comment together, so a pin and its label cannot drift apart. Every update pull request is labelled `type:chore`.

The groups take minor and patch updates only, so a week is one grouped pull request per ecosystem and directory. Dependabot groups each listed directory on its own, so the workflows and `.github/actions/*` can each get one: two pull requests for the actions in one week is the configuration working, not a duplicate. A major update arrives as a pull request of its own: it is a decision that may need code changes, and inside a group it would hold the routine updates back until it is dealt with.

A dependency held back for a known breakage gets an `ignore` entry with the reason and the condition for removing it.

Upgrades used to be manual: nothing updated the pins automatically, a cost the pinning rule accepted rather than overlooked. That decision did not weigh that Dependabot moves the SHA pin and its version comment together, so an automated upgrade is still a pinned, reviewable diff, and the cost no longer has to be paid. Renovate does the same job and was rejected: it runs as a GitHub App with a configuration of its own, while Dependabot is built into GitHub and already raises the repository's security updates.

## Labels

`.github/labels.json` is the source for the repository's labels, and [Contributing](../CONTRIBUTING.md#issues) describes the groups and how they are synced to GitHub. Dependabot's pull requests and the issue forms apply labels from that list, so a label they name must exist on GitHub first.

## Branch protection

The workflow reports; it does not block on its own. What blocks is the `main` ruleset on the default branch, repository settings no file here can enforce. It replaced a classic branch protection rule in November 2026; a ruleset does the same job with more control, and either works if nobody can bypass it. The ruleset holds:

| Setting                | Value                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Required status checks | `Web` and `Rust`, from the GitHub Actions app, so no other integration can report a passing check under those names |
| Up-to-date branches    | Required: a pull request merges only after its checks ran against the current `main`                                |
| Pull requests          | Required before merging, with every review thread resolved; no approval is required, since one maintainer reviews   |
| Merge method           | Merge commits only, so `main` keeps each pull request's commits as they were checked                                |
| Enforced for admins    | Yes, with no bypass actors                                                                                          |
| Force pushes, deletion | Refused                                                                                                             |

`Desktop (Windows)` and `Desktop (Linux)` are not required yet: adding them to the ruleset is a change in the repository settings. The check names are the job `name:` values in `ci.yml`. If a job is renamed, the required check must be updated to match, or the renamed check will never report as required.

Admin enforcement is what makes the rest hold: without it, a maintainer's direct push to `main` is stopped only by the `pre-push` hook, which `--no-verify` skips.

Up-to-date branches are required so that what CI checked is what lands: a branch behind `main` was checked without the commits it will merge onto. A merge queue would check the merge result without the extra update, but GitHub offers merge queues only on repositories owned by an organization, and this one belongs to a user. "Allow updating pull request branches" is on, so bringing a branch up to date is one button.

"Automatically delete head branches" is on too. Deleting a merged branch is what makes GitHub retarget a pull request built on it to that branch's own base. With the branch left behind, the next pull request merges into it and never reaches `main`.

## Security settings

These are repository settings, not files, and are on for this repository:

- **Dependabot alerts and security updates.** An alert opens for a vulnerable dependency, and Dependabot opens a pull request that fixes it when it can, outside the weekly schedule above.
- **CodeQL default setup**, for the workflows, JavaScript and TypeScript, and Rust. It runs on pull requests and on `main`, and reports to code scanning; its check is not required.
- **Secret scanning with push protection.** A push that contains a recognized secret is refused before it lands.
- **Private vulnerability reporting**, which [`SECURITY.md`](../SECURITY.md) points reporters to.
- **Actions restricted to SHA-pinned references**, as [Pinning third-party actions](#pinning-third-party-actions) describes, with the default workflow token read-only.

## Not covered yet

- **Native builds on macOS and mobile.** `build:desktop` on macOS, `build:android`, and `build:ios` run from a developer's machine.
