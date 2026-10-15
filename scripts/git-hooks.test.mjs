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

function assertBranchRejected(repo, branch) {
  const result = repo.git("push", "origin", `HEAD:refs/heads/${branch}`);
  assertRejected(result, /does not match <type>\/<slug>/);
  assert.ok(result.stderr.includes(`"${branch}"`), result.stderr);
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
  repo.run("checkout", "-b", "feat/notes-search");
  writeFileSync(join(repo.cwd, "new file.txt"), "forgotten\n");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "blocked"), /untracked/);
});

test("pre-commit blocks partially staged changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  writeFileSync(join(repo.cwd, "file.txt"), "staged\n");
  repo.run("add", "file.txt");
  writeFileSync(join(repo.cwd, "file.txt"), "unstaged\n");
  assertRejected(repo.git("commit", "-m", "blocked"), /unstaged/);
});

test("pre-commit accepts fully staged additions and excludes ignored secrets", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  writeFileSync(join(repo.cwd, "new file.txt"), "included\n");
  writeFileSync(join(repo.cwd, ".env"), "local fixture\n");
  repo.run("add", ".");
  repo.run("commit", "-m", "feat: allowed");
  assert.equal(readFileSync(repo.log, "utf8"), "format:check\nlint:check\n");
  assert.equal(repo.run("ls-files", ".env"), "");
});

test("pre-commit propagates failed quality checks", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.env.VISTA_CHECK_EXIT = "1";
  assert.notEqual(repo.git("commit", "--allow-empty", "-m", "feat: blocked").status, 0);
});

test("pre-push blocks a feature branch mapped to remote main", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("commit", "--allow-empty", "-m", "feat: feature");
  assertRejected(repo.git("push", "origin", "HEAD:main"), /pull request/);
});

test("pre-push blocks deleting remote main", (context) => {
  const repo = createRepository(context);
  assertRejected(repo.git("push", "origin", ":main"), /pull request/);
});

test("pre-push blocks a dirty checkout", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  writeFileSync(join(repo.cwd, "file.txt"), "dirty\n");
  assertRejected(repo.git("push", "origin", "feat/notes-search"), /clean working tree/);
});

test("pre-push rejects a commit other than the checked-out commit", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("commit", "--allow-empty", "-m", "feat: feature");
  assertRejected(repo.git("push", "origin", "main:other"), /checked-out commit/);
});

test("pre-push accepts the checked-out feature commit without running quality checks", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.env.VISTA_CHECK_EXIT = "1";
  repo.run("push", "origin", "feat/notes-search");
  assert.equal(existsSync(repo.log), false);
});

test("pre-push blocks staged but uncommitted changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  writeFileSync(join(repo.cwd, "file.txt"), "staged\n");
  repo.run("add", "file.txt");
  assertRejected(repo.git("push", "origin", "feat/notes-search"), /clean working tree/);
});

test("pre-push accepts branch names in the <type>/<slug> form", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("push", "origin", "HEAD:refs/heads/feat/notes-search");
  repo.run("push", "origin", "HEAD:refs/heads/fix/a.b-c");
  assert.match(repo.run("ls-remote", "--heads", "origin"), /refs\/heads\/fix\/a\.b-c/);
});

test("pre-push rejects branch names that are not <type>/<slug>", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  for (const branch of ["claude/foo", "Feat/x", "feat/-notes", "feat/a.-b", "feat/Bad_Name", "feature"]) {
    assertBranchRejected(repo, branch);
  }
});

test("pre-push accepts tag pushes regardless of name", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("tag", "v0.1.0");
  repo.run("push", "origin", "v0.1.0");
  assert.match(repo.run("ls-remote", "--tags", "origin"), /refs\/tags\/v0\.1\.0/);
});

test("pre-push accepts deleting a misnamed remote branch", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("push", "--no-verify", "origin", "HEAD:refs/heads/claude/foo");
  repo.run("push", "origin", ":refs/heads/claude/foo");
  assert.equal(repo.run("ls-remote", "--heads", "origin", "claude/foo"), "");
});

test("commit type list in commit-msg matches check-git-state", () => {
  const commitMsg = readFileSync(join(repositoryRoot, ".githooks", "commit-msg"), "utf8");
  const checkScript = readFileSync(join(repositoryRoot, "scripts", "check-git-state.mjs"), "utf8");
  const shellTypes = commitMsg.match(/^TYPES='([^']*)'$/m)?.[1].split("|");
  const scriptList = checkScript.match(/COMMIT_TYPES = \[([^\]]*)\]/)?.[1];
  assert.ok(shellTypes && scriptList, "could not find both type lists");
  assert.deepEqual(
    scriptList.match(/"[^"]+"/g).map((type) => type.slice(1, -1)),
    shellTypes,
  );
});

test("commit-msg blocks non-conventional commit messages", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "invalid subject"), /start with a type and a colon/);
});

test("commit-msg blocks subjects starting with a capital letter", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "feat: Add feature"), /starts with a capital/);
});

test("commit-msg blocks subjects ending with a period", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  assertRejected(repo.git("commit", "--allow-empty", "-m", "feat: add feature."), /ends with a period/);
});

test("commit-msg blocks subjects exceeding 72 characters", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  const longSubject = `feat: ${"a".repeat(70)}`;
  assertRejected(repo.git("commit", "--allow-empty", "-m", longSubject), /over the 72 limit/);
});

test("commit-msg blocks empty messages", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  assertRejected(repo.git("commit", "--allow-empty", "-m", ""), /commit message is empty/);
});

test("commit-msg accepts valid Conventional Commits with and without scope, including breaking changes", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("commit", "--allow-empty", "-m", "feat(app): add note editor");
  repo.run("commit", "--allow-empty", "-m", "fix(web)!: handle permission revocation");
  repo.run("commit", "--allow-empty", "-m", "docs: update contributing guide");
});

test("commit-msg allows merge, revert, and autosquash subjects", (context) => {
  const repo = createRepository(context);
  repo.run("checkout", "-b", "feat/notes-search");
  repo.run("commit", "--allow-empty", "-m", "Merge branch 'main' into feature");
  repo.run("commit", "--allow-empty", "-m", 'Revert "feat: something"');
  repo.run("commit", "--allow-empty", "-m", "fixup! feat: something");
});
