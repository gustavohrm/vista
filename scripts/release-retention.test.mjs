import { describe, expect, it, vi } from "vitest";

import { pruneReleases, versionsToDelete } from "./release-retention.mjs";

describe("versionsToDelete", () => {
  it("keeps only the published version before 1.0", () => {
    expect(versionsToDelete(["0.1.0", "0.2.0", "0.2.1"], "0.2.1")).toEqual(["0.1.0", "0.2.0"]);
  });

  it("keeps every release of the published major from 1.0 on", () => {
    expect(versionsToDelete(["0.9.0", "1.0.0", "1.2.0", "2.0.0", "2.1.0"], "2.1.0")).toEqual([
      "0.9.0",
      "1.0.0",
      "1.2.0",
    ]);
  });

  it("drops every 0.x release once 1.0 ships", () => {
    expect(versionsToDelete(["0.5.0", "1.0.0"], "1.0.0")).toEqual(["0.5.0"]);
  });

  it("never deletes a version newer than the published one", () => {
    expect(versionsToDelete(["0.3.0", "0.4.0"], "0.3.0")).toEqual([]);
    expect(versionsToDelete(["1.0.0", "2.0.0", "1.1.0"], "1.1.0")).toEqual([]);
  });

  it("orders a pre-release before its release", () => {
    expect(versionsToDelete(["0.3.0-beta.1", "0.3.0"], "0.3.0")).toEqual(["0.3.0-beta.1"]);
    expect(versionsToDelete(["0.3.0-beta.2", "0.3.0"], "0.3.0-beta.2")).toEqual([]);
  });

  it("leaves names that are not versions alone", () => {
    expect(versionsToDelete(["notes", "0.1.0", "0.2.0"], "0.2.0")).toEqual(["0.1.0"]);
  });

  it("rejects a published version that is not a version", () => {
    expect(() => versionsToDelete(["0.1.0"], "latest")).toThrow('"latest" is not a version');
  });
});

/** @param {string[]} keys - The object keys the bucket starts with. */
function fakeBucket(keys) {
  const stored = new Set(keys);
  return {
    stored,
    listPrefixes: vi.fn(async () => [
      ...new Set([...stored].filter((key) => key.includes("/")).map((key) => key.slice(0, key.indexOf("/")))),
    ]),
    listKeys: vi.fn(async (prefix) => [...stored].filter((key) => key.startsWith(prefix))),
    deleteKey: vi.fn(async (key) => {
      stored.delete(key);
    }),
  };
}

describe("pruneReleases", () => {
  it("deletes every file of the old versions and nothing else", async () => {
    const bucket = fakeBucket(["latest.json", "0.1.0/a.exe", "0.1.0/a.exe.sig", "0.2.0/b.exe", "0.2.0/b.exe.sig"]);

    expect(await pruneReleases(bucket, "0.2.0")).toEqual(["0.1.0"]);
    expect([...bucket.stored].sort()).toEqual(["0.2.0/b.exe", "0.2.0/b.exe.sig", "latest.json"]);
  });

  it("deletes nothing when the published version is not in the bucket", async () => {
    const bucket = fakeBucket(["0.1.0/a.exe"]);

    await expect(pruneReleases(bucket, "0.2.0")).rejects.toThrow('"0.2.0" is not in the bucket');
    expect(bucket.deleteKey).not.toHaveBeenCalled();
  });
});
