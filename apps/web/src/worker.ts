// The Worker serves the web app, and the desktop releases from the R2 bucket bound as `RELEASES`, so the
// installers and the updater are served from wherever the web app is hosted.

interface ReleaseObject {
  readonly body: ReadableStream;
  readonly size: number;
  readonly httpEtag: string;
  text(): Promise<string>;
}

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  RELEASES: {
    get(key: string): Promise<ReleaseObject | null>;
  };
}

interface Manifest {
  platforms?: Record<string, { url: string; signature: string }>;
}

const MANIFEST_KEY = "latest.json";
const ALLOWED_METHODS = "GET, HEAD";
// Matches the version folders `scripts/release-manifest.mjs` writes and the file names Tauri gives installers.
const RELEASE_FILE_PATH = /^\/releases\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const DOWNLOAD_PLATFORMS: Record<string, string> = {
  windows: "windows-x86_64",
  linux: "linux-x86_64",
};

const notFound = (text = "Not found.") => new Response(text, { status: 404 });

// The manifest is stored with URLs relative to the releases folder and served with absolute ones on this origin.
async function readManifest(env: Env, origin: string): Promise<Manifest | null> {
  const object = await env.RELEASES.get(MANIFEST_KEY);
  if (!object) {
    return null;
  }
  const manifest = JSON.parse(await object.text()) as Manifest;
  for (const entry of Object.values(manifest.platforms ?? {})) {
    entry.url = new URL(`/releases/${entry.url}`, origin).href;
  }
  return manifest;
}

async function serveManifest(env: Env, url: URL, isHead: boolean): Promise<Response> {
  const manifest = await readManifest(env, url.origin);
  if (!manifest) {
    // Tauri's updater reads 204 as "no update available".
    return new Response(null, { status: 204 });
  }
  // Revalidated on every check, so a release reaches clients as soon as it is published.
  const headers = { "content-type": "application/json", "cache-control": "no-cache" };
  return new Response(isHead ? null : JSON.stringify(manifest), { headers });
}

async function serveReleaseFile(env: Env, version: string, file: string, isHead: boolean): Promise<Response> {
  const object = await env.RELEASES.get(`${version}/${file}`);
  if (!object) {
    return notFound();
  }
  return new Response(isHead ? null : object.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
      "content-disposition": `attachment; filename="${file}"`,
      etag: object.httpEtag,
      // A published version's files never change; a new version gets a new folder.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

async function redirectToInstaller(env: Env, url: URL, platform: string): Promise<Response> {
  const key = DOWNLOAD_PLATFORMS[platform];
  if (!key) {
    return notFound();
  }
  const installer = (await readManifest(env, url.origin))?.platforms?.[key];
  if (!installer) {
    return notFound("No desktop release has been published yet.");
  }
  return new Response(null, { status: 302, headers: { location: installer.url, "cache-control": "no-cache" } });
}

async function serveReleases(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", { status: 405, headers: { allow: ALLOWED_METHODS } });
  }
  const isHead = request.method === "HEAD";
  if (url.pathname === `/releases/${MANIFEST_KEY}`) {
    return serveManifest(env, url, isHead);
  }
  if (url.pathname.startsWith("/download/")) {
    return redirectToInstaller(env, url, url.pathname.slice("/download/".length));
  }
  const [, version, file] = RELEASE_FILE_PATH.exec(url.pathname) ?? [];
  // Anything else under /releases/ is a 404, never the app's HTML, so a wrong updater URL fails visibly.
  return version && file ? serveReleaseFile(env, version, file, isHead) : notFound();
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/releases/") || url.pathname.startsWith("/download/")) {
      return serveReleases(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
