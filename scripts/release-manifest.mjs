#!/usr/bin/env node
// Writes `latest.json`, the manifest the desktop updater reads, from a release's
// signed installers.
//
// Usage: node scripts/release-manifest.mjs <version> <directory>
//
// URLs are relative to the releases folder (`0.2.0/Vista_0.2.0_x64-setup.exe`);
// the Worker makes them absolute against the origin it is served from, so the
// manifest works wherever the web app is hosted.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ url: string, signature: string }} PlatformEntry */

// Tauri's updater only installs these formats: NSIS on Windows, AppImage on Linux.
const PLATFORMS = [
  {
    key: "windows-x86_64",
    label: "Windows installer",
    matches: (/** @type {string} */ name) => /setup.*\.exe$/.test(name),
  },
  { key: "linux-x86_64", label: "Linux AppImage", matches: (/** @type {string} */ name) => name.endsWith(".AppImage") },
];

/**
 * Builds the updater manifest for one release.
 *
 * @param {{ version: string, pubDate: string, names: string[], read: (name: string) => string }} release -
 *   The version, the publication time as an ISO 8601 string, the file names in the release directory, and a
 *   function that reads one of them as text.
 * @returns {{ version: string, pub_date: string, platforms: Record<string, PlatformEntry> }} The manifest.
 * @throws {Error} When a platform has no installer, more than one, or one without its `.sig` file.
 */
export function buildManifest({ version, pubDate, names, read }) {
  const prefix = `Vista_${version}_`;
  /** @type {Record<string, PlatformEntry>} */
  const platforms = {};
  for (const platform of PLATFORMS) {
    const found = names.filter((name) => name.startsWith(prefix) && platform.matches(name));
    if (found.length === 0) {
      throw new Error(`No ${platform.label} for ${version}.`);
    }
    if (found.length > 1) {
      throw new Error(`More than one ${platform.label} for ${version}: ${found.join(", ")}.`);
    }
    const [installer] = found;
    if (!names.includes(`${installer}.sig`)) {
      throw new Error(`${installer} has no .sig file. Build with createUpdaterArtifacts and the signing key.`);
    }
    platforms[platform.key] = { url: `${version}/${installer}`, signature: read(`${installer}.sig`).trim() };
  }
  return { version, pub_date: pubDate, platforms };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, directory] = process.argv.slice(2);
  if (!version || !directory) {
    console.error("Usage: node scripts/release-manifest.mjs <version> <directory>");
    process.exit(1);
  }
  const manifest = buildManifest({
    version,
    pubDate: new Date().toISOString(),
    names: readdirSync(directory),
    read: (name) => readFileSync(join(directory, name), "utf8"),
  });
  writeFileSync(join(directory, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${join(directory, "latest.json")} for ${version}.`);
}
