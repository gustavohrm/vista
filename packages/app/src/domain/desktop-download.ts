/** A link to the desktop installer for the system the browser runs on. */
export interface DesktopDownload {
  label: string;
  /** A path the web host redirects to the current installer, as `apps/web/src/worker.ts` serves it. */
  href: string;
}

/** The processor a browser reports through User-Agent Client Hints, as `"x86"` and `"64"`. */
export interface CpuArchitecture {
  architecture: string;
  bitness: string;
}

/**
 * Picks the desktop installer for the system a browser's user agent names. Only Windows and x86_64
 * desktop Linux have a build; Linux gets the AppImage, which needs no package manager.
 *
 * @param userAgent - The browser's `navigator.userAgent`.
 * @param cpu - The processor the browser reports, where it reports one. Chromium's user agent names
 *   `Linux x86_64` on every Linux, ARM included, so where this is known it decides the architecture.
 * @returns The download, or null on a system with no desktop build, such as macOS, ARM Linux, or a phone.
 */
export function desktopDownloadFor(userAgent: string, cpu: CpuArchitecture | null = null): DesktopDownload | null {
  if (/Windows NT/.test(userAgent)) {
    return { label: "Download for Windows", href: "/download/windows" };
  }
  // Releases hold only `linux-x86_64-*` builds, so an ARM or 32-bit Linux browser gets nothing.
  // Without a reported processor only a user agent that names its real one can decide, which Chromium's,
  // reduced to `Linux x86_64` on every Linux, does not; it reports none on a non-secure origin.
  const isX86_64 = cpu
    ? cpu.architecture === "x86" && cpu.bitness === "64"
    : /Linux (?:x86_64|amd64)/.test(userAgent) && !/Chrome\//.test(userAgent);
  if (/Linux/.test(userAgent) && isX86_64 && !/Android|CrOS/.test(userAgent)) {
    return { label: "Download for Linux", href: "/download/linux" };
  }
  return null;
}
