---
status: DRAFT
last_updated: 2026-11-13
scope: Vista's name, brand idea, logo, wordmark, colours, and typefaces, and why each was chosen.
---

# Brand

This guideline records Vista's brand decisions and how to apply them. [Assets](../assets.md) catalogs the files that carry them and how to use each one. It is a draft until its owner has read it: the name, the mark, and the Daylight colour were chosen on 2026-11-13, and the positioning and personality below are inferred from the product and still to be confirmed.

## Name

The product is called **Vista**, written with a capital V in prose. The packages use the `@vista` scope, the Tauri `productName` is `Vista`, and the bundle identifier is `com.coden.vista`.

### What it means

In Portuguese, Spanish, and Italian, _vista_ is sight and a view. In English, a vista is "a distant view or prospect, especially one seen through some opening, avenue or passage" ([Wiktionary](https://en.wiktionary.org/wiki/vista)). The English sense is the story the name tells: the folder is the landscape and stays where it is, and Vista is the opening it is seen through. Portuguese adds _ponto de vista_, a point of view, which is what the raw and rendered views of one file are.

### Why it was kept

Vista started as a working name. It was judged against 18 alternatives on 2026-11-13 and kept: it is two syllables, spelled and said the same way in the four languages above, has no bad meaning in them, and no notes or knowledge app was found using it.

Its known weaknesses, accepted with the name:

- **Search.** "Vista app" returns Windows Vista, VistaPrint (which owns `vista.com`), Vista Social, and Viewpoint Vista. People will have to search for "Vista" with "Coden" or "Markdown".
- **Windows Vista.** The best-known software called Vista is an operating system remembered as a failure. The logo stays away from its orb and four-pane window.
- **Domains.** The short domains are taken or unknown. Vista ships at `vista.coden.dev`.
- **Trademark.** No trademark registry or app store was searched. Nothing here is legal clearance.

Rejected alternatives:

| Name   | Meaning                                                  | Why it lost                                                                                                  |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Veduta | Italian "view"; the genre of exact city paintings        | The same root as Vista in a word few people know; a small active project and a photo app use it.             |
| Fresta | Portuguese for a slit that lets light in                 | A Japanese supermarket chain and a small software studio use it; English ears hear "fiesta".                 |
| Luneta | Portuguese for a spyglass                                | Two terminal tools use it, and the story is about looking far away, while Vista shows what is already yours. |
| Mikata | Japanese 見方 "way of seeing" and 味方 "ally"            | Several mid-sized companies use it.                                                                          |
| Mado   | Japanese 窓, "window"                                    | A local-first Markdown reader for macOS is called Mado.                                                      |
| Verso  | The other side of a leaf of paper                        | Verso Notes is a local-first Markdown notes app.                                                             |
| Others | Engram, Opsis, Glia, Vitral, Fovea, Mirante, Oriel, Vejo | An active product in or near the field uses the name, or it has a bad meaning in Spanish.                    |

## Brand idea

**Your files are the view; Vista is the opening.** Vista does not hold notes. It opens a folder that is already yours and shows what is in it: Markdown as a document, CSV as a table, and later PDFs, images, and video. Close Vista and the files are exactly where and what they were.

### Positioning

For people who keep their notes and personal data as ordinary files and want one place to see all of it, Vista is the workspace that renders each file richly while leaving it an ordinary file in a folder they organize themselves, because it works directly on local folders and stores nothing of its own.

Assumptions to confirm:

- The audience already wants its data as files, and chooses Vista over Notion for ownership and over a code editor for the rendered views.
- Showing many file types in one place, not Markdown editing alone, is what sets Vista apart from Obsidian and Typora.

### Personality

| Scale                   | Position             | Why                                                                               | Misreading to avoid                    |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| Restrained ↔ expressive | Restrained           | The files are the content; the interface and the brand stay out of their way.     | Cold or empty.                         |
| Technical ↔ plain       | Plain, exact         | It handles real files, so it says exactly what it will read, write, or overwrite. | Jargon about file systems.             |
| Serious ↔ playful       | Calm, with one spark | One bright colour in a quiet system, as one view opens in a plain folder.         | Neon everywhere.                       |
| Closed ↔ open           | Open                 | Nothing is locked in; every file opens in any other program.                      | Looking unfinished or without opinion. |

## Logo

### Mark

The mark is **the opening**: a V with flat tops, and a bar seen in it. The V is the opening and the bar is the view through it, a horizon. It is also the name's initial, but the bar carries the idea and the colour, and the mark is never drawn without it.

Its geometry is fixed, on a construction box 84 units wide and 68 tall:

- The V's outer corners are at the top left and top right of the box and its point at the bottom centre. Each arm is 20 units wide, measured along the top.
- The bar sits at the top of the opening, 9 units tall, with its ends parallel to the arms and 7 units from them, measured along the top.
- Corners are rounded by 3 units on the V, 4 at its point, 1.5 at the inside of the point, and 2 on the bar. Rounding pulls the outline in, so the drawn mark measures 79.24 by 64.388 units, and the mark files are fitted to that.

Every file is solid fills only, with no strokes, text, styles, or transforms, so it renders the same in every tool.

### Small version

At 32 px and below, the bar and its gaps fall under 2 px and blur away, so the icon files for those sizes use a heavier drawing: arms 22 units wide, the bar 14 units tall, and gaps of 9 units, with the mark at 72% of the plate's width. At that weight the bar becomes a wedge, which is why the small version is never shown large.

### Wordmark

The wordmark is lowercase **vista**, set in Schibsted Grotesk SemiBold (weight 600) and converted to outlines, so it never depends on the font being installed. Lowercase matches the Coden family's logos; the pointed, flat-topped `v` repeats the mark's shape.

Spacing, reviewed at heights of 150, 60, 28, and 16 px: tracking is −15/1000 em on top of the font's kerning (`vi` −9, `is` −4, `st` −4, `ta` −3), with no further pair adjustments. At 0 the word looks loose beside the heavy mark; at −25 the `s` and `t` begin to touch at 16 px.

### Lockup

In the full logo, the mark sits left of the wordmark, scaled so its flat top is level with the top of the `t` and its point reaches 1 unit below the baseline, as a pointed shape must to look as if it stands on it. The gap between them is 24 units, a little more than one arm of the V.

### Versions

`light` and `dark` describe the artwork, as in [Assets](../assets.md#image-naming).

| Version   | Files                                | Use                                                                                                                  |
| --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Colour    | `logo-*.svg`, `mark-*.svg`           | Default wherever colour is reproduced faithfully. The bar is Daylight on dark grounds, Daylight deep on bright ones. |
| One-color | `logo-mono-*.svg`, `mark-mono-*.svg` | Single-ink print, engraving, embroidery, and any ground that is itself Daylight.                                     |
| Wordmark  | `wordmark-*.svg`                     | Where the mark already appears nearby.                                                                               |
| Plate     | `icon/*`, `favicon/*`                | The mark on an ink plate, for app icons and favicons. Never placed on a page as a logo.                              |

### Clear space and minimum size

- Clear space on every side equals the width of one arm of the V, a quarter of the mark's width. Nothing else, including the edge of the page, enters it.
- Minimum size: the full logo at 80 px or 20 mm wide; the mark at 24 px or 6 mm wide. Below that, use the plate, which switches to the small version.

### Misuse

Do not:

- retype the name in Schibsted Grotesk or any other font in place of a logo file;
- draw the V without its bar, or move, widen, or recolour the bar to anything but Daylight, Daylight deep, or the mark's own colour;
- place the colour logo on a Daylight ground, where the bar disappears: use the one-color dark version;
- place the logo on a photograph or pattern; put it on a plain ground instead;
- stretch, rotate, outline, or add shadows or gradients.

### App icon and favicon

The app icon and favicon are the bright mark with a Daylight bar on an ink plate: `#0a0a0a`, corners rounded to 22.5% of the side, the mark 62% of the side wide and set 1.5% of the side below centre, because its weight is at the top. A bare mark disappears on one of the two taskbar themes; the plate keeps it visible on both. The plate and its proportions follow Haku's, so Coden's app icons sit together as a set.

### Neighbours

Marks seen on each product's own site or repository on 2026-11-13:

| Product      | Mark                            | Colours           |
| ------------ | ------------------------------- | ----------------- |
| Obsidian     | A faceted crystal               | Purple            |
| Notion       | An "N" on a cube                | Black and white   |
| Logseq       | Three rounded blobs             | Teal on dark teal |
| Anytype      | A pixel smile                   | Black and white   |
| AFFiNE       | A triangle of fine lines        | Black and white   |
| Joplin       | A "J" on a rounded square       | White on blue     |
| Bear         | A bear's head in a disc         | Red               |
| Typora       | A serif "T" on a sheet of paper | Black and grey    |
| Zettlr       | A zeta on a rounded square      | White on green    |
| iA Writer    | The letters "iA"                | Black and white   |
| SilverBullet | A five-bladed propeller         | Silver on blue    |
| VS Code      | A folded ribbon                 | Blue              |
| Zed          | A "Z" of nested lines           | White on black    |

None uses a V or a yellow-green. Outside the category, the mark's nearest relatives are Vue and Vuetify, which also put a shape in a V's notch: Vue's is a second, smaller V in green and navy, Vuetify's is faceted blue. Vista's is one flat bar in Daylight on a single-colour V. The kinship is real and accepted; a mark that dropped the bar or turned it into a chevron would close the distance.

Rejected marks:

| Mark         | Idea                                              | Why it lost                                                           |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Two views    | A disc, half raw lines and half solid             | Reads as a "D" with speed lines, and has no tie to the name.          |
| Arch         | Lines receding to a horizon, seen through an arch | Reads as a gravestone.                                                |
| Open chevron | The file tree's expanded chevron with a row in it | Reads as a face.                                                      |
| Strata       | Stripes cut to a V                                | Reads as a filter icon.                                               |
| Split square | Lines beside a solid pane                         | A generic layout icon.                                                |
| Eye          | _Vista_ as eyesight                               | Suggests watching, which is wrong for an app that leaves files alone. |

## Colours

**Daylight is Vista's colour.** It is the light seen through the opening, and a highlighter's colour, the one colour people add to plain text. It also sets Vista apart in a category of purple, blue, teal, green, red, and black and white, and from Haku and Coden, which are monochrome.

Vista will offer several interface themes. Daylight is Vista's own theme and identity; a monochrome theme and others will sit beside it. Today the interface has one appearance, taken from `@codenhub/styles`, and no theme uses Daylight yet. Brand surfaces, which are the logo, the app icon, a website, and release notes, always use Daylight.

The neutrals are the `@codenhub/styles` palette's, so the brand and the interface share them. OKLCH values are the source; hex and RGB are their sRGB conversions.

| Token           | OKLCH                   | Hex       | RGB           | Role                                                                         |
| --------------- | ----------------------- | --------- | ------------- | ---------------------------------------------------------------------------- |
| `daylight`      | `oklch(89.4% 0.2 123)`  | `#c5f03b` | 197, 240, 59  | The bar on dark grounds; fills and highlights, with ink text on top.         |
| `daylight-deep` | `oklch(54.4% 0.13 122)` | `#637b09` | 99, 123, 9    | The bar on bright grounds; Daylight as text or line on bright grounds.       |
| `ink`           | `oklch(14.5% 0 0)`      | `#0a0a0a` | 10, 10, 10    | Dark ground, the icon plate, text and mark on bright grounds. `neutral-950`. |
| `paper`         | `oklch(98.5% 0 0)`      | `#fafafa` | 250, 250, 250 | Bright ground, text and mark on dark grounds. `neutral-50`.                  |

Secondary text, surfaces, and borders use the palette's other steps as the interface does: `neutral-400` and `neutral-700` for secondary text, `neutral-900` and `neutral-100` for raised surfaces.

Proportion: ink or paper covers almost all of any layout, and Daylight no more than about a twentieth of it, in one place. A layout with Daylight in several places, or as its ground, stops reading as Vista; the one exception is a full Daylight ground carrying the one-color dark logo.

Dark is the brand's primary look: the app icon and anything presented first are dark, where Daylight is strongest.

### Approved pairings

Contrast ratios per WCAG 2.2. The logo is exempt as a logotype; its bar tones are listed for reference.

| Foreground      | Background    | Ratio   | Approved for                        |
| --------------- | ------------- | ------- | ----------------------------------- |
| `paper`         | `ink`         | 18.97:1 | All text                            |
| `ink`           | `paper`       | 18.97:1 | All text                            |
| `ink`           | `daylight`    | 14.99:1 | All text                            |
| `daylight`      | `ink`         | 14.99:1 | All text                            |
| `daylight`      | `neutral-900` | 13.58:1 | All text                            |
| `daylight-deep` | `paper`       | 4.61:1  | All text                            |
| `daylight-deep` | `neutral-100` | 4.41:1  | Large text and interface parts only |
| `daylight-deep` | `ink`         | 4.12:1  | Large text and interface parts only |
| `daylight`      | `paper`       | 1.27:1  | Never                               |

Daylight on a bright ground is invisible, which is why `daylight-deep` exists: it is the same hue, darkened until it reaches 4.5:1 on paper, at the highest chroma sRGB holds there.

## Typefaces

| Family            | Role                                                               | License     | Fallback                              |
| ----------------- | ------------------------------------------------------------------ | ----------- | ------------------------------------- |
| Schibsted Grotesk | Brand: the wordmark and display lines on brand surfaces.           | SIL OFL 1.1 | Inter SemiBold.                       |
| Inter             | Everything else on brand surfaces: body, captions, interface text. | SIL OFL 1.1 | Segoe UI, then the system sans-serif. |

Schibsted Grotesk was drawn for a news publisher: sturdy at display sizes, with a pointed `v` and flat-cut terminals that match the mark. It is bundled under `assets/fonts/`. Inter is the Coden family's interface typeface. The application does not bundle either yet: its interface uses the `--font-default` of `@codenhub/styles`, which resolves to the system font. Bundling Inter is a separate decision for the interface, not made here.

Type scale for brand surfaces:

| Level   | Family            | Size / line height | Weight | Tracking |
| ------- | ----------------- | ------------------ | ------ | -------- |
| Display | Schibsted Grotesk | 48 / 1.05          | 600    | −0.02 em |
| H1      | Schibsted Grotesk | 32 / 1.15          | 600    | −0.01 em |
| H2      | Inter             | 22 / 1.3           | 600    | 0        |
| Body    | Inter             | 16 / 1.55          | 400    | 0        |
| Small   | Inter             | 13 / 1.4           | 500    | 0        |

Rejected brand typefaces:

| Typeface            | Why it lost                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Outfit              | Haku's brand typeface; two sibling products would share one wordmark style. |
| Bricolage Grotesque | Its quirks compete with the mark, and it is widely used at the moment.      |
| Geologica, Sora     | Wide and soft; the round `v` and `a` fight the mark's flat cuts.            |
| Instrument Serif    | An italic serif reads as an editorial product.                              |
| Inter alone         | Sets the wordmark in the interface's own face, with nothing of its own.     |

## Graphic element

**The horizon.** One Daylight bar with the mark's slanted ends, three times as wide as it is tall or wider, placed once in a layout at the thing to look at: above a headline, or at the top edge. It is the mark's bar let out of the V, and it makes a layout recognizable without the logo. Use it once per layout, never as a divider or a list bullet, and never beside the logo at the same size.

## Not decided

- **Voice, tagline, and messaging.** Interface text follows the [documentation guidelines](documentation.md); there is no marketing voice yet.
- **Motion.** There is no animated logo or loader.
- **Themes.** How Daylight becomes an interface theme, and which tokens it sets, belongs to a specification that does not exist yet.
