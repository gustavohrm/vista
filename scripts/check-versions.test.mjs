import { describe, expect, it } from "vitest";

import { findVersionProblems } from "./check-versions.mjs";

const CARGO = `[package]
name = "vista-native"
version = "1.2.3"

[dependencies]
tauri = { version = "2.12.5", features = [] }
`;

/** @type {(options?: { versions?: Record<string, string>, cargo?: string, tauriVersion?: string }) => (path: string) => string} */
const readerFor = ({ versions = {}, cargo = CARGO, tauriVersion = "../package.json" } = {}) => {
  return (path) => {
    if (path.endsWith("Cargo.toml")) {
      return cargo;
    }
    if (path.endsWith("tauri.conf.json")) {
      return JSON.stringify({ productName: "Vista", version: tauriVersion });
    }
    return JSON.stringify({ version: versions[path] ?? "1.2.3" });
  };
};

describe("findVersionProblems", () => {
  it("passes when every manifest carries the same version", () => {
    expect(findVersionProblems(readerFor())).toEqual([]);
  });

  it("names a package.json whose version differs", () => {
    expect(findVersionProblems(readerFor({ versions: { "apps/web/package.json": "1.2.4" } }))).toEqual([
      'apps/web/package.json has version "1.2.4", but package.json has "1.2.3".',
    ]);
  });

  it("reads the Cargo version from [package], not from a dependency", () => {
    const cargo = CARGO.replace('version = "1.2.3"', 'version = "1.0.0"');
    expect(findVersionProblems(readerFor({ cargo }))).toEqual([
      'apps/native/src-tauri/Cargo.toml has version "1.0.0", but package.json has "1.2.3".',
    ]);
  });

  it("rejects a Cargo manifest whose [package] has no literal version", () => {
    const cargo = CARGO.replace('version = "1.2.3"', "version.workspace = true");
    expect(findVersionProblems(readerFor({ cargo }))).toEqual([
      'apps/native/src-tauri/Cargo.toml has no `version = "..."` line in [package].',
    ]);
  });

  it("rejects a package.json with no version", () => {
    /** @type {(path: string) => string} */
    const read = (path) => (path === "packages/app/package.json" ? "{}" : readerFor()(path));
    expect(findVersionProblems(read)).toEqual(['packages/app/package.json has no "version" string.']);
  });

  it("requires the Tauri config to take its version from the native package.json", () => {
    expect(findVersionProblems(readerFor({ tauriVersion: "1.2.3" }))).toEqual([
      'apps/native/src-tauri/tauri.conf.json must set "version" to "../package.json", not "1.2.3".',
    ]);
  });
});
