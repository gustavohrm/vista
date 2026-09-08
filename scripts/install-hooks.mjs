import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";

if (!process.env.CI && existsSync(".git")) {
  const configured = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
  if (configured.error || (configured.status !== 0 && configured.status !== 1)) {
    throw new Error(configured.error?.message || configured.stderr || "Cannot inspect Git hook configuration");
  }
  const current = configured.stdout.trim();
  if (current && current !== ".githooks") {
    throw new Error(
      `Existing core.hooksPath is ${current}. Reconcile it with .githooks before installing Vista hooks.`,
    );
  }
  for (const hook of ["pre-commit", "pre-push"]) {
    chmodSync(`.githooks/${hook}`, 0o755);
  }
  const installed = spawnSync("git", ["config", "--local", "core.hooksPath", ".githooks"], { encoding: "utf8" });
  if (installed.error || installed.status !== 0) {
    throw new Error(installed.error?.message || installed.stderr || "Cannot install Git hooks");
  }
  console.log("Vista Git hooks installed.");
}
