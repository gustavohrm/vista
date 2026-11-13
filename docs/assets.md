---
status: IMPLEMENTED
last_updated: 2026-11-13
scope: Brand artwork, animated logos, and the brand font under root `assets/`, and the app icons generated from them in `apps/native/src-tauri/icons/`.
---

# Assets

This document catalogs the files under `assets/` and explains how to choose and use them. [Brand](guidelines/brand.md) records why they look the way they do. Paths are relative to the repository root.

## Image naming

`light` and `dark` describe the artwork, not the application theme:

- `*-light.svg` is bright artwork. Place it on a dark background.
- `*-dark.svg` is dark artwork. Place it on a bright background.

Choose an image by the background actually behind it, not by a theme name or the user's colour-scheme preference.

## Logos

Logo files are transparent SVG artwork made of filled paths only. Keep the aspect ratio when resizing.

| File                              | Artwork                                    | Proportions (w × h) | Use                                        |
| --------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------ |
| `assets/logo/logo-light.svg`      | Mark and wordmark, bright, Daylight bar    | 327.42 × 78.32      | Full identification on dark backgrounds.   |
| `assets/logo/logo-dark.svg`       | Mark and wordmark, dark, Daylight deep bar | 327.42 × 78.32      | Full identification on bright backgrounds. |
| `assets/logo/logo-mono-light.svg` | Mark and wordmark, one bright colour       | 327.42 × 78.32      | One-ink use on dark backgrounds.           |
| `assets/logo/logo-mono-dark.svg`  | Mark and wordmark, one dark colour         | 327.42 × 78.32      | One-ink use, and on a Daylight background. |
| `assets/logo/mark-light.svg`      | Mark, bright, Daylight bar                 | 79.24 × 64.388      | Compact placement on dark backgrounds.     |
| `assets/logo/mark-dark.svg`       | Mark, dark, Daylight deep bar              | 79.24 × 64.388      | Compact placement on bright backgrounds.   |
| `assets/logo/mark-mono-light.svg` | Mark, one bright colour                    | 79.24 × 64.388      | As `logo-mono-light.svg`.                  |
| `assets/logo/mark-mono-dark.svg`  | Mark, one dark colour                      | 79.24 × 64.388      | As `logo-mono-dark.svg`.                   |
| `assets/logo/wordmark-light.svg`  | Wordmark alone, bright                     | 219.73 × 78.32      | Where the mark already appears nearby.     |
| `assets/logo/wordmark-dark.svg`   | Wordmark alone, dark                       | 219.73 × 78.32      | As above, on bright backgrounds.           |

The files carry a `viewBox` and no `width` or `height`, so set a size where they are placed. Use the full logo when there is room and the name must be visible, and the mark when there is not:

```html
<img src="/assets/logo/logo-light.svg" alt="Vista" width="251" height="60" />
```

The URL assumes the consumer serves the file at that path; where it goes is the consumer's choice.

## App icon and favicons

| File                             | Content                                                             | Use                                                                  |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `assets/icon/app-icon.svg`       | Bright mark on the ink plate, 1024 × 1024                           | Source artwork for the app icon, above 32 px.                        |
| `assets/icon/app-icon-small.svg` | The [small version](guidelines/brand.md#small-version) on the plate | Source artwork at 32 px and below.                                   |
| `assets/icon/app-icon.png`       | `app-icon.svg` rendered at 1024 px                                  | Input to `tauri icon`.                                               |
| `assets/favicon/favicon.svg`     | Same artwork as `app-icon-small.svg`                                | Favicon for browsers that take SVG.                                  |
| `assets/favicon/favicon.ico`     | 16, 24, 32 from the small version; 48, 64, 256 from the regular one | Favicon for browsers without SVG favicons, and the Windows app icon. |

The web host links both favicons from `apps/web/src/index.html`, the ICO with `sizes="any"` before the SVG, so a browser that takes SVG uses it and any other falls back to the ICO. Vite copies both into the build.

### Regenerating the app icons

`apps/native/src-tauri/icons/` holds the icons the bundler and the window use; `tauri.conf.json` lists them. They are generated from `assets/icon/`:

1. Render `assets/icon/app-icon.svg` to `assets/icon/app-icon.png` at 1024 px with a transparent background.
2. `pnpm --filter @vista/native exec tauri icon ../../assets/icon/app-icon.png -o src-tauri/icons`.
3. Rebuild `assets/favicon/favicon.ico` with each size rendered from its source SVG at that size, not scaled down from one large image, and copy it over `apps/native/src-tauri/icons/icon.ico`. Replace `apps/native/src-tauri/icons/32x32.png` with `app-icon-small.svg` rendered at 32 px.

Step 3 exists because `tauri icon` scales one 1024 px image down, which blurs the bar away at the sizes a taskbar and a title bar show.

## Animated logos

Animated versions of the logo, as [Motion](guidelines/brand.md#motion) describes. Each is the still file of the same name with its paths unchanged and a `<style>` block that animates them, so it plays in an `<img>` tag, a browser, and most design tools, with no script. Each honours `prefers-reduced-motion`. Naming follows [Image naming](#image-naming).

| File                                 | Animation                                      | Use                                                |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `assets/motion/logo-enter-light.svg` | Full logo entrance, once, 740 ms               | A first view on a dark background.                 |
| `assets/motion/logo-enter-dark.svg`  | As above, dark artwork                         | A first view on a bright background.               |
| `assets/motion/mark-enter-light.svg` | Mark entrance, once, 640 ms                    | Where only the mark fits, on a dark background.    |
| `assets/motion/mark-enter-dark.svg`  | As above, dark artwork                         | Where only the mark fits, on a bright background.  |
| `assets/motion/mark-loop-light.svg`  | Loader: the bar sweeps the opening, 1.6 s loop | A wait that fills an area, on a dark background.   |
| `assets/motion/mark-loop-dark.svg`   | As above, dark artwork                         | A wait that fills an area, on a bright background. |

An entrance plays when the image loads; to replay it, load the image again. Rebuild a file from its still version when the still one changes: keep the paths identical, so the last frame of an entrance is the still logo.

The application does not load these files. It draws the same logo and loader inline in `packages/app/src/components/brand/vista-logo.tsx`, with the motion in `packages/app/src/style.css`, so they take the theme's colours.

## Social

| File                         | Content                                                   | Use                            |
| ---------------------------- | --------------------------------------------------------- | ------------------------------ |
| `assets/social/og-image.png` | The brand idea, the horizon bar, and the logo, 1200 × 630 | Link previews for the web app. |

No page references it yet: adding the Open Graph tags to the web host is a separate change.

## Fonts

Schibsted Grotesk is the brand typeface, for the wordmark and display lines on brand surfaces. The application does not load it.

| File                                                           | Format                         |
| -------------------------------------------------------------- | ------------------------------ |
| `assets/fonts/schibsted-grotesk/SchibstedGrotesk-Variable.ttf` | TTF, variable, weights 400–900 |
| `assets/fonts/schibsted-grotesk/LICENSE.txt`                   | License                        |

Schibsted Grotesk is © 2023 The Schibsted-Grotesk Project Authors, under the SIL Open Font License 1.1. Keep `LICENSE.txt` with the file when bundling or redistributing it. Inter, the other typeface the brand names, is not bundled here; it is available from <https://rsms.me/inter/> under the same license.
