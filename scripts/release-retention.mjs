#!/usr/bin/env node
// Deletes old releases from the R2 bucket, to stay inside the free storage tier.
//
// Before 1.0 only the published version is kept. From 1.0 on, every release of
// the published major is kept and older majors are deleted. A version newer than
// the published one is never deleted, and a folder whose name is not a version is
// left alone.
//
// Usage: node scripts/release-retention.mjs <published version>
// Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (with R2 write access), and
// RELEASES_BUCKET in the environment. Run it only after `latest.json` points at
// the published version, so the updater never names a deleted file.
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const API_BASE = "https://api.cloudflare.com/client/v4";
const PAGE_SIZE = 1000;

/** @typedef {{ major: number, minor: number, patch: number, pre: string[] }} Version */
/**
 * @typedef {{
 *   success?: boolean,
 *   errors?: { message: string }[],
 *   result?: { key: string }[],
 *   result_info?: { cursor?: string, is_truncated?: boolean, delimited?: string[] },
 * }} ApiResponse
 */

/** @type {(text: string) => Version | null} */
const parseVersion = (text) => {
  const match = VERSION_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split(".") : [],
  };
};

// Semantic Versioning precedence: a pre-release sorts before its release, and numeric identifiers compare as numbers.
/** @type {(a: Version, b: Version) => number} */
const compareVersions = (a, b) => {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) {
    return core;
  }
  if (a.pre.length === 0 || b.pre.length === 0) {
    return b.pre.length - a.pre.length;
  }
  for (const [i, x] of a.pre.entries()) {
    const y = b.pre[i];
    if (y === undefined) {
      // `b` is a prefix of `a`, and a longer pre-release sorts later.
      return 1;
    }
    if (x === y) {
      continue;
    }
    const [isXNumber, isYNumber] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (isXNumber && isYNumber) {
      return Number(x) - Number(y);
    }
    if (isXNumber !== isYNumber) {
      return isXNumber ? -1 : 1;
    }
    return x < y ? -1 : 1;
  }
  return a.pre.length - b.pre.length;
};

/**
 * Chooses which stored versions the retention rule deletes.
 *
 * @param {string[]} stored - The version folders in the bucket.
 * @param {string} published - The version just published.
 * @returns {string[]} The versions to delete, in the order given.
 * @throws {Error} When `published` is not a semantic version.
 */
export function versionsToDelete(stored, published) {
  const current = parseVersion(published);
  if (!current) {
    throw new Error(`"${published}" is not a version.`);
  }
  return stored.filter((name) => {
    const version = parseVersion(name);
    if (!version || compareVersions(version, current) >= 0) {
      return false;
    }
    return current.major === 0 || version.major !== current.major;
  });
}

/**
 * @typedef {object} ReleaseBucket
 * @property {() => Promise<string[]>} listPrefixes - The top-level folder names, without the trailing slash.
 * @property {(prefix: string) => Promise<string[]>} listKeys - Every key that starts with `prefix`.
 * @property {(key: string) => Promise<void>} deleteKey - Deletes one object.
 */

/**
 * Deletes every file of the versions the retention rule drops.
 *
 * @param {ReleaseBucket} bucket - The bucket to prune.
 * @param {string} published - The version just published.
 * @returns {Promise<string[]>} The versions deleted.
 * @throws {Error} When `published` is not in the bucket, before anything is deleted.
 */
export async function pruneReleases(bucket, published) {
  const stored = await bucket.listPrefixes();
  if (!stored.includes(published)) {
    throw new Error(`"${published}" is not in the bucket, so nothing was deleted.`);
  }
  const doomed = versionsToDelete(stored, published);
  for (const version of doomed) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one version at a time, so a failure stops the run with the rest untouched
    for (const key of await bucket.listKeys(`${version}/`)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a failed delete should not be followed by more
      await bucket.deleteKey(key);
    }
  }
  return doomed;
}

/** @type {(options: { accountId: string, token: string, bucketName: string }) => ReleaseBucket} */
const cloudflareBucket = ({ accountId, token, bucketName }) => {
  const objectsUrl = `${API_BASE}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects`;

  /** @type {(url: string, init?: RequestInit) => Promise<ApiResponse>} */
  const call = async (url, init) => {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}` } });
    // Checked below: anything without `success: true` is treated as a failure.
    const body = /** @type {ApiResponse | null} */ (await response.json().catch(() => null));
    if (!response.ok || !body?.success) {
      const reason = body?.errors?.map((e) => e.message).join("; ");
      throw new Error(`Cloudflare R2 request failed with HTTP ${response.status}${reason ? `: ${reason}` : ""}.`);
    }
    return body;
  };

  /** @type {(params: Record<string, string>) => Promise<ApiResponse[]>} */
  const listPages = async (params) => {
    const pages = [];
    let cursor = "";
    do {
      const query = new URLSearchParams({ ...params, per_page: String(PAGE_SIZE), ...(cursor ? { cursor } : {}) });
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page's cursor comes from the page before it
      const body = await call(`${objectsUrl}?${query}`);
      pages.push(body);
      cursor = body.result_info?.is_truncated ? (body.result_info.cursor ?? "") : "";
    } while (cursor);
    return pages;
  };

  return {
    async listPrefixes() {
      const pages = await listPages({ delimiter: "/" });
      return pages.flatMap((body) => body.result_info?.delimited ?? []).map((prefix) => prefix.replace(/\/$/, ""));
    },
    async listKeys(prefix) {
      const pages = await listPages({ prefix });
      return pages.flatMap((body) => body.result ?? []).map((object) => object.key);
    },
    async deleteKey(key) {
      // The API takes the key's slashes literally; each segment is encoded on its own.
      await call(`${objectsUrl}/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" });
    },
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [published] = process.argv.slice(2);
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token, RELEASES_BUCKET: bucketName } = process.env;
  if (!published || !accountId || !token || !bucketName) {
    console.error(
      "Usage: node scripts/release-retention.mjs <version>, with CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and RELEASES_BUCKET set.",
    );
    process.exit(1);
  }
  const deleted = await pruneReleases(cloudflareBucket({ accountId, token, bucketName }), published);
  console.log(deleted.length > 0 ? `Deleted ${deleted.join(", ")}.` : "No old releases to delete.");
}
