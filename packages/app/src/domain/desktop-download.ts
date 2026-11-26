import { t } from "../i18n";

/**
 * Which installer a download offers: Windows, Linux, or Linux named with its x86_64 build, for a browser
 * that doesn't report its processor.
 */
export type DesktopSystem = "windows" | "linux" | "linuxX86_64";

/** A link to the desktop installer for the system the browser runs on. */
export interface DesktopDownload {
  /** The system it is for, which names the link in the interface language, through `desktopDownloadLabel()`. */
  system: DesktopSystem;
  /** A path the web host redirects to the current installer, as `apps/web/src/worker.ts` serves it. */
  href: string;
  /** The version the link downloads, such as `0.2.0`, when it is known. */
  version?: string;
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
 * @param cpu - The processor the browser reports, where it reports one. Chromium's and Firefox's
 *   user agents both name `Linux x86_64` on every Linux, ARM included, so where this is known it
 *   decides the architecture; where it is not, the Linux offer names the build's, so the user can judge.
 * @returns The download, or null on a system with no desktop build, such as macOS, ARM Linux the
 *   browser reports, or a phone.
 */
export function desktopDownloadFor(userAgent: string, cpu: CpuArchitecture | null = null): DesktopDownload | null {
  if (/Windows NT/.test(userAgent)) {
    return { system: "windows", href: "/download/windows" };
  }
  // Releases hold only `linux-x86_64-*` builds.
  if (!/Linux (?:x86_64|amd64)/.test(userAgent) || /Android|CrOS/.test(userAgent)) {
    return null;
  }
  if (!cpu) {
    return { system: "linuxX86_64", href: "/download/linux" };
  }
  return cpu.architecture === "x86" && cpu.bitness === "64" ? { system: "linux", href: "/download/linux" } : null;
}

/**
 * Names a download in the interface language, as "Download for Windows", or with Vista's name, as
 * "Download Vista for Windows", where nothing around the link says what it downloads.
 *
 * @param download - The download to name.
 * @param withName - Whether the name says it is Vista that downloads.
 * @returns The link's text.
 */
export function desktopDownloadLabel(download: DesktopDownload, withName = false): string {
  if (withName) {
    return t(`download.vistaFor.${download.system}`);
  }
  return t(`download.for.${download.system}`);
}
