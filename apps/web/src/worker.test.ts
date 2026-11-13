import { describe, expect, it, vi } from "vitest";

import worker from "./worker";

const MANIFEST = {
  version: "0.2.0",
  pub_date: "2026-11-13T00:00:00.000Z",
  platforms: {
    "windows-x86_64-nsis": { url: "0.2.0/Vista_0.2.0_x64-setup.exe", signature: "sig-w" },
    "linux-x86_64-appimage": { url: "0.2.0/Vista_0.2.0_amd64.AppImage", signature: "sig-l" },
    "linux-x86_64-deb": { url: "0.2.0/Vista_0.2.0_amd64.deb", signature: "sig-d" },
    "linux-x86_64-rpm": { url: "0.2.0/Vista-0.2.0-1.x86_64.rpm", signature: "sig-r" },
  },
};

function objectOf(text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    size: bytes.byteLength,
    httpEtag: '"etag-1"',
    get body() {
      return new Blob([bytes]).stream();
    },
    text: async () => text,
  };
}

function envWith(objects: Record<string, string>) {
  return {
    ASSETS: { fetch: vi.fn(async () => new Response("app shell")) },
    RELEASES: {
      get: vi.fn(async (key: string) => {
        const text = objects[key];
        return text === undefined ? null : objectOf(text);
      }),
    },
  };
}

const ORIGIN = "https://vista.example";
const request = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);

describe("worker", () => {
  it("serves the app for any other path", async () => {
    const env = envWith({});
    const response = await worker.fetch(request("/notes/today"), env);

    expect(await response.text()).toBe("app shell");
    expect(env.RELEASES.get).not.toHaveBeenCalled();
  });

  it("serves the manifest with installer URLs on its own origin", async () => {
    const response = await worker.fetch(
      request("/releases/latest.json"),
      envWith({ "latest.json": JSON.stringify(MANIFEST) }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.json()).toEqual({
      ...MANIFEST,
      platforms: {
        "windows-x86_64-nsis": { url: `${ORIGIN}/releases/0.2.0/Vista_0.2.0_x64-setup.exe`, signature: "sig-w" },
        "linux-x86_64-appimage": { url: `${ORIGIN}/releases/0.2.0/Vista_0.2.0_amd64.AppImage`, signature: "sig-l" },
        "linux-x86_64-deb": { url: `${ORIGIN}/releases/0.2.0/Vista_0.2.0_amd64.deb`, signature: "sig-d" },
        "linux-x86_64-rpm": { url: `${ORIGIN}/releases/0.2.0/Vista-0.2.0-1.x86_64.rpm`, signature: "sig-r" },
      },
    });
  });

  it("says there is no update when nothing is published", async () => {
    const response = await worker.fetch(request("/releases/latest.json"), envWith({}));

    expect(response.status).toBe(204);
  });

  it("serves an installer as a download that never changes", async () => {
    const env = envWith({ "0.2.0/Vista_0.2.0_x64-setup.exe": "installer bytes" });
    const response = await worker.fetch(request("/releases/0.2.0/Vista_0.2.0_x64-setup.exe"), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("installer bytes");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Vista_0.2.0_x64-setup.exe"');
    expect(response.headers.get("etag")).toBe('"etag-1"');
  });

  it("answers HEAD without a body", async () => {
    const env = envWith({ "0.2.0/Vista_0.2.0_x64-setup.exe": "installer bytes" });
    const response = await worker.fetch(request("/releases/0.2.0/Vista_0.2.0_x64-setup.exe", { method: "HEAD" }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("15");
    expect(await response.text()).toBe("");
  });

  it.each([
    ["a missing installer", "/releases/0.2.0/nothing.exe"],
    ["a path that climbs out of a release", "/releases/0.2.0/..%2Flatest.json"],
    ["a folder that is not a version", "/releases/latest/Vista.exe"],
    ["a nested path", "/releases/0.2.0/a/b.exe"],
  ])("returns 404, not the app, for %s", async (_case, path) => {
    const env = envWith({ "latest.json": JSON.stringify(MANIFEST) });
    const response = await worker.fetch(request(path), env);

    expect(response.status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("refuses to change releases", async () => {
    const response = await worker.fetch(request("/releases/latest.json", { method: "PUT", body: "{}" }), envWith({}));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });

  it.each([
    ["windows", "Vista_0.2.0_x64-setup.exe"],
    ["linux", "Vista_0.2.0_amd64.AppImage"],
    ["deb", "Vista_0.2.0_amd64.deb"],
    ["rpm", "Vista-0.2.0-1.x86_64.rpm"],
  ])("redirects /download/%s to the current installer", async (platform, file) => {
    const response = await worker.fetch(
      request(`/download/${platform}`),
      envWith({ "latest.json": JSON.stringify(MANIFEST) }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/releases/0.2.0/${file}`);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("says so when there is no desktop release to download", async () => {
    const response = await worker.fetch(request("/download/windows"), envWith({}));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("No desktop release has been published yet.");
  });

  it("returns 404 for a platform it has no installer for", async () => {
    const response = await worker.fetch(
      request("/download/macos"),
      envWith({ "latest.json": JSON.stringify(MANIFEST) }),
    );

    expect(response.status).toBe(404);
  });
});
