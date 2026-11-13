#!/usr/bin/env node
// Fails when the workspace manifests disagree on Vista's version.
//
// The desktop bundle takes its version from `apps/native/package.json` through
// `tauri.conf.json`, and the updater compares it with the published release, so a
// manifest left behind ships a build that reports the wrong version or never
// sees its update. `Cargo.toml` cannot read a package.json, so it is compared too.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "package.json";
const PACKAGE_MANIFESTS = ["apps/native/package.json", "apps/web/package.json", "packages/app/package.json"];
const CARGO_MANIFEST = "apps/native/src-tauri/Cargo.toml";
const TAURI_CONFIG = "apps/native/src-tauri/tauri.conf.json";
const TAURI_VERSION_SOURCE = "../package.json";

/** @typedef {(path: string) => string} ReadFile */

/** @type {(read: ReadFile, path: string) => string | null} */
const packageVersion = (read, path) => {
  const { version } = JSON.parse(read(path));
  return typeof version === "string" ? version : null;
};

// Only the `[package]` table is read, so a dependency's `version = ...` never counts.
/** @type {(text: string) => string | null} */
const cargoVersion = (text) => {
  const table = text.split(/^\[/m).find((section) => section.startsWith("package]"));
  const match = table?.match(/^version\s*=\s*"([^"]+)"\s*$/m);
  return match?.[1] ?? null;
};

/**
 * Compares every manifest with the root `package.json` version.
 *
 * @param {ReadFile} read - Returns a repository file's text by its path from the root.
 * @returns {string[]} One message per problem; empty when every manifest agrees.
 */
export function findVersionProblems(read) {
  /** @type {string[]} */
  const problems = [];
  const expected = packageVersion(read, SOURCE);
  if (expected === null) {
    return [`${SOURCE} has no "version" string.`];
  }

  /** @type {(path: string, version: string | null, missing: string) => void} */
  const compare = (path, version, missing) => {
    if (version === null) {
      problems.push(missing);
    } else if (version !== expected) {
      problems.push(`${path} has version "${version}", but ${SOURCE} has "${expected}".`);
    }
  };
  for (const path of PACKAGE_MANIFESTS) {
    compare(path, packageVersion(read, path), `${path} has no "version" string.`);
  }
  compare(
    CARGO_MANIFEST,
    cargoVersion(read(CARGO_MANIFEST)),
    `${CARGO_MANIFEST} has no \`version = "..."\` line in [package].`,
  );

  const tauriVersion = JSON.parse(read(TAURI_CONFIG)).version;
  if (tauriVersion !== TAURI_VERSION_SOURCE) {
    problems.push(`${TAURI_CONFIG} must set "version" to "${TAURI_VERSION_SOURCE}", not "${tauriVersion}".`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findVersionProblems((path) => readFileSync(path, "utf8"));
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error("Set every manifest to the same version.");
    process.exit(1);
  }
  console.log("Every manifest has the same version.");
}
