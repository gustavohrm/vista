/** A link to the desktop installer for the system the browser runs on. */
export interface DesktopDownload {
  label: string;
  /** A path the web host redirects to the current installer, as `apps/web/src/worker.ts` serves it. */
  href: string;
}

/**
 * Picks the desktop installer for the system a browser's user agent names. Only Windows and x86_64
 * desktop Linux have a build; Linux gets the AppImage, which needs no package manager.
 *
 * @param userAgent - The browser's `navigator.userAgent`.
 * @returns The download, or null on a system with no desktop build, such as macOS, ARM Linux, or a phone.
 */
export function desktopDownloadFor(userAgent: string): DesktopDownload | null {
  if (/Windows NT/.test(userAgent)) {
    return { label: "Download for Windows", href: "/download/windows" };
  }
  // Releases hold only `linux-x86_64-*` builds, so an ARM or 32-bit Linux browser gets nothing.
  if (/Linux (?:x86_64|amd64)/.test(userAgent) && !/Android|CrOS/.test(userAgent)) {
    return { label: "Download for Linux", href: "/download/linux" };
  }
  return null;
}
