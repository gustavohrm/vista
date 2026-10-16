import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The commit types, as in `.githooks/commit-msg`. Keep the two lists the same;
// the test suite checks that they match.
const COMMIT_TYPES = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"];
const BRANCH_NAME = new RegExp(`^(${COMMIT_TYPES.join("|")})/[a-z0-9]+([.-][a-z0-9]+)*$`);

function readGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || "Git inspection failed");
  }
  return result.stdout;
}

function checkCommit() {
  const branch = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { encoding: "utf8" });
  if (branch.status !== 0 || branch.stdout.trim() === "main") {
    throw new Error("Create or switch to a feature branch before committing. Changes to main require a pull request.");
  }
  if (readGit(["ls-files", "--others", "--exclude-standard", "-z"])) {
    throw new Error(
      "There are non-ignored untracked files. Stage intended files or explicitly ignore local-only files.",
    );
  }
  if (readGit(["diff", "--name-only", "--ignore-submodules=none", "-z"])) {
    throw new Error(
      "There are unstaged changes. Stage all intended changes before committing; partial commits are blocked.",
    );
  }
  if (readGit(["ls-files", "--unmerged", "-z"])) {
    throw new Error("Resolve and stage all merge conflicts before committing.");
  }
}

function checkPush() {
  const updates = readFileSync(0, "utf8").trim().split(/\r?\n/).filter(Boolean);
  const head = readGit(["rev-parse", "HEAD"]).trim();
  for (const update of updates) {
    const fields = update.split(/\s+/);
    if (fields.length !== 4) {
      throw new Error("Cannot validate the push: unexpected Git ref update.");
    }
    const [, localOid, remoteRef] = fields;
    if (remoteRef === "refs/heads/main") {
      throw new Error(
        "Direct updates or deletions of main are blocked. Push a feature branch and open a pull request.",
      );
    }
    // An annotated tag's OID names the tag object, so compare the commit it points to.
    if (!/^0+$/.test(localOid) && readGit(["rev-parse", `${localOid}^{commit}`]).trim() !== head) {
      throw new Error("Push only the checked-out commit; push other commits from their own checkout.");
    }
    // A deletion removes a name, which is how a misnamed branch gets cleaned up, so it passes.
    // Tags carry no branch name to check.
    if (!/^0+$/.test(localOid) && remoteRef.startsWith("refs/heads/")) {
      const branch = remoteRef.slice("refs/heads/".length);
      if (!BRANCH_NAME.test(branch)) {
        throw new Error(
          `Branch name "${branch}" does not match <type>/<slug>, for example feat/notes-search. ` +
            `Types: ${COMMIT_TYPES.join(", ")}. Rename the branch with git branch -m, then push again.`,
        );
      }
    }
  }
  if (readGit(["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"])) {
    throw new Error(
      "Push requires a clean working tree, including non-ignored untracked files. Commit all intended changes first.",
    );
  }
}

try {
  const hook = process.argv[2];
  if (hook === "pre-commit") {
    checkCommit();
  } else if (hook === "pre-push") {
    checkPush();
  } else {
    throw new Error("Expected pre-commit or pre-push.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
