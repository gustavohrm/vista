/** Platform host kinds supported by the shared application. */
export type AppPlatform = "native" | "web";

/** Capabilities and platform information supplied by a Vista host. */
export interface AppAdapter {
  /** Platform currently hosting the shared application. */
  platform: AppPlatform;
}
