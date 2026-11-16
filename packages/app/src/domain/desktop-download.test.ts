import { describe, expect, it } from "vitest";

import { desktopDownloadFor } from "./desktop-download";

describe("desktopDownloadFor", () => {
  it("offers the Windows installer on Windows", () => {
    expect(
      desktopDownloadFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"),
    ).toEqual({ label: "Download for Windows", href: "/download/windows" });
  });

  it("offers the AppImage on desktop Linux", () => {
    expect(
      desktopDownloadFor("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"),
    ).toEqual({ label: "Download for Linux", href: "/download/linux" });
  });

  it.each([
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"],
    ["Android", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36"],
    ["ChromeOS", "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"],
    ["iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"],
    ["ARM Linux", "Mozilla/5.0 (X11; Linux aarch64; rv:140.0) Gecko/20100101 Firefox/140.0"],
  ])("offers nothing on %s, which has no desktop build", (_name, userAgent) => {
    expect(desktopDownloadFor(userAgent)).toBeNull();
  });
});
