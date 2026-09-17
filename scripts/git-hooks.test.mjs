import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function createRepository(context) {
  const directory = mkdtempSync(join(tmpdir(), "vista-hooks-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const cwd = join(directory, "repo");
  const bin = join(directory, "bin");
  const log = join(directory, "checks.log");
  mkdirSync(cwd);
  mkdirSync(bin);
  writeFileSync(
    join(bin, "pnpm"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$VISTA_HOOK_LOG"\nexit "${VISTA_CHECK_EXIT:-0}"\n',
  );
  chmodSync(join(bin, "pnpm"), 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
    VISTA_HOOK_LOG: log,
  };
  // Real parent Git hooks export these; fixture repositories must remain isolated.
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX", "GIT_COMMON_DIR"]) {
    delete env[key];
  }
  const git = (...args) => spawnSync("git", args, { cwd, env, encoding: "utf8" });
  const run = (...args) => {
    const result = git(...args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  run("init", "-b", "main");
  run("config", "user.name", "Vista Hook Test");
  run("config", "user.email", "hooks@example.invalid");
  run("config", "commit.gpgsign", "false");
  run("config", "core.autocrlf", "false");
  run("config", "core.hooksPath", join(directory, "no-hooks"));
  writeFileSync(join(cwd, ".gitignore"), ".env\n");
  writeFileSync(join(cwd, "file.txt"), "initial\n");
  mkdirSync(join(cwd, "scripts"));
  mkdirSync(join(cwd, ".githooks"));
  for (const script of ["check-git-state.mjs", "install-hooks.mjs"]) {
    copyFileSync(join(repositoryRoot, "scripts", script), join(cwd, "scripts", script));
  }
  for (const hook of ["pre-commit", "pre-push", "commit-msg"]) {
    copyFileSync(join(repositoryRoot, ".githooks", hook), join(cwd, ".githooks", hook));
    chmodSync(join(cwd, ".githooks", hook), 0o755);
  }
  run("add", ".");
  run("commit", "-m", "chore: initial");
  run("init", "--bare", join(directory, "remote.git"));
  run("remote", "add", "origin", join(directory, "remote.git"));
  run("push", "origin", "main");
  run("config", "--unset", "core.hooksPath");
  const installed = spawnSync(process.execPath, ["scripts/install-hooks.mjs"], {
    cwd,
    env: { ...env, CI: "" },
    encoding: "utf8",
  });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(run("config", "--get", "core.hooksPath"), ".githooks");
  return { cwd, env, git, run, log };
}

function assertRejected(result, message) {
  assert.notEqual(result.status, 0, "Git unexpectedly accepted the operation");
  assert.match(result.stderr, message);
}

test("pre-commit blocks commits on main", (context) => {
  const repo = createRepository(context);
  assertRejected(repo.git("commit", "--allow-empty", "-m", "blocked"), /feature branch/);
});

test("pre-commit blocks detached HEAD", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "--detach");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "blocked"), /feature branch/);
});

test("pre-commit blocks untracked files, including names with spaces", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  writeFileSync(join(repo.cwd, "new file.txt"), "forgotten\n");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "blocked"), /untracked/);
});

test("pre-commit blocks partially staged changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  writeFileSync(join(repo.cwd, "file.txt"), "staged\n");
  repo.run("add", "file.txt");
  writeFileSync(join(repo.cwd, "file.txt"), "unstaged\n");
  assertRejected(repo.git("commit", "-m", "blocked"), /unstaged/);
});

test("pre-commit accepts fully staged additions and excludes ignored secrets", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  writeFileSync(join(repo.cwd, "new file.txt"), "included\n");
  writeFileSync(join(repo.cwd, ".env"), "local fixture\n");
  repo.run("add", ".");
  repo.run("commit", "-m", "feat: allowed");
  assert.equal(readFileSync(repo.log, "utf8"), "format:check\nlint:check\n");
  assert.equal(repo.run("ls-files", ".env"), "");
});

test("pre-commit propagates failed quality checks", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.env.VISTA_CHECK_EXIT = "1";
  assert.notEqual(repo.git("commit", "--allow-empty", "-m", "feat: blocked").status, 0);
});

test("pre-push blocks a feature branch mapped to remote main", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.run("commit", "--allow-empty", "-m", "feat: feature");
  assertRejected(repo.git("push", "origin", "HEAD:main"), /pull request/);
});

test("pre-push blocks deleting remote main", (context) => {
  const repo = createRepository(context);
  assertRejected(repo.git("push", "origin", ":main"), /pull request/);
});

test("pre-push blocks a dirty checkout", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  writeFileSync(join(repo.cwd, "file.txt"), "dirty\n");
  assertRejected(repo.git("push", "origin", "feature"), /clean working tree/);
});

test("pre-push rejects a commit other than the checked-out commit", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.run("commit", "--allow-empty", "-m", "feat: feature");
  assertRejected(repo.git("push", "origin", "main:other"), /checked-out commit/);
});

test("pre-push accepts the checked-out feature commit without running quality checks", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.env.VISTA_CHECK_EXIT = "1";
  repo.run("push", "origin", "feature");
  assert.equal(existsSync(repo.log), false);
});

test("pre-push blocks staged but uncommitted changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  writeFileSync(join(repo.cwd, "file.txt"), "staged\n");
  repo.run("add", "file.txt");
  assertRejected(repo.git("push", "origin", "feature"), /clean working tree/);
});

test("commit-msg blocks non-conventional commit messages", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "invalid subject"), /start with a type and a colon/);
});

test("commit-msg blocks subjects starting with a capital letter", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "feat: Add feature"), /starts with a capital/);
});

test("commit-msg blocks subjects ending with a period", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "feat: add feature."), /ends with a period/);
});

test("commit-msg blocks subjects exceeding 72 characters", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  const longSubject = `feat: ${"a".repeat(70)}`;
  assertRejected(repo.git("commit", "--allow-empty", "-m", longSubject), /over the 72 limit/);
});

test("commit-msg blocks empty messages", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  assertRejected(repo.git("commit", "--allow-empty", "-m", ""), /commit message is empty/);
});

test("commit-msg accepts valid Conventional Commits with and without scope, including breaking changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.run("commit", "--allow-empty", "-m", "feat(app): add note editor");
  repo.run("commit", "--allow-empty", "-m", "fix(web)!: handle permission revocation");
  repo.run("commit", "--allow-empty", "-m", "docs: update contributing guide");
});

test("commit-msg allows merge, revert, and autosquash subjects", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feature");
  repo.run("commit", "--allow-empty", "-m", "Merge branch 'main' into feature");
  repo.run("commit", "--allow-empty", "-m", 'Revert "feat: something"');
  repo.run("commit", "--allow-empty", "-m", "fixup! feat: something");
});
