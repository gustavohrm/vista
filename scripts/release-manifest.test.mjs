import { describe, expect, it } from "vitest";

import { buildManifest } from "./release-manifest.mjs";

const FILES = {
  "Vista_0.2.0_x64-setup.exe": "exe",
  "Vista_0.2.0_x64-setup.exe.sig": "windows-signature",
  "Vista_0.2.0_amd64.AppImage": "appimage",
  "Vista_0.2.0_amd64.AppImage.sig": "linux-signature",
  "Vista_0.2.0_amd64.deb": "deb",
  "Vista_0.2.0_amd64.deb.sig": "deb-signature",
  "Vista-0.2.0-1.x86_64.rpm": "rpm",
  "Vista-0.2.0-1.x86_64.rpm.sig": "rpm-signature",
};

/** @type {(files: Record<string, string>) => { names: string[], read: (name: string) => string }} */
const readerFor = (files) => ({
  names: Object.keys(files),
  read: (name) => files[name] ?? "",
});

/** @type {(files: Record<string, string>, name: string) => Record<string, string>} */
const without = (files, name) => Object.fromEntries(Object.entries(files).filter(([key]) => key !== name));

describe("buildManifest", () => {
  it("points each kind of install at its own package, relative to the releases folder", () => {
    expect(buildManifest({ version: "0.2.0", pubDate: "2026-11-13T00:00:00.000Z", ...readerFor(FILES) })).toEqual({
      version: "0.2.0",
      pub_date: "2026-11-13T00:00:00.000Z",
      platforms: {
        "windows-x86_64-nsis": { url: "0.2.0/Vista_0.2.0_x64-setup.exe", signature: "windows-signature" },
        "linux-x86_64-appimage": { url: "0.2.0/Vista_0.2.0_amd64.AppImage", signature: "linux-signature" },
        "linux-x86_64-deb": { url: "0.2.0/Vista_0.2.0_amd64.deb", signature: "deb-signature" },
        "linux-x86_64-rpm": { url: "0.2.0/Vista-0.2.0-1.x86_64.rpm", signature: "rpm-signature" },
      },
    });
  });

  it("fails when an installer is missing", () => {
    const rest = without(FILES, "Vista_0.2.0_amd64.AppImage");

    expect(() => buildManifest({ version: "0.2.0", pubDate: "x", ...readerFor(rest) })).toThrow(
      "No Linux AppImage for 0.2.0",
    );
  });

  it("fails when an installer has no signature", () => {
    const rest = without(FILES, "Vista_0.2.0_x64-setup.exe.sig");

    expect(() => buildManifest({ version: "0.2.0", pubDate: "x", ...readerFor(rest) })).toThrow(
      "Vista_0.2.0_x64-setup.exe has no .sig file",
    );
  });

  it("ignores an installer built for another version", () => {
    const files = { ...FILES, "Vista_0.1.0_x64-setup.exe": "old", "Vista_0.1.0_x64-setup.exe.sig": "old" };

    expect(
      buildManifest({ version: "0.2.0", pubDate: "x", ...readerFor(files) }).platforms["windows-x86_64-nsis"]?.url,
    ).toBe("0.2.0/Vista_0.2.0_x64-setup.exe");
  });

  it("fails when a Linux package has no signature", () => {
    const rest = without(FILES, "Vista-0.2.0-1.x86_64.rpm.sig");

    expect(() => buildManifest({ version: "0.2.0", pubDate: "x", ...readerFor(rest) })).toThrow(
      "Vista-0.2.0-1.x86_64.rpm has no .sig file",
    );
  });

  it("fails when two installers match one platform", () => {
    const files = { ...FILES, "Vista_0.2.0_x64-setup (1).exe": "copy" };

    expect(() => buildManifest({ version: "0.2.0", pubDate: "x", ...readerFor(files) })).toThrow(
      "More than one Windows installer for 0.2.0",
    );
  });
});
