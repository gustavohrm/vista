---
status: DRAFT
last_updated: 2026-11-18
scope: The appearance preferences, which are theme, scheme, contrast, and motion, how each is chosen, stored, and applied, what each theme must provide, and the upstream changes they rely on.
---

# Appearance

This document proposes how Vista's appearance becomes configurable beyond today's light, dark, and system choice. It is a draft for the owner to approve or change; nothing in it is implemented. It describes Vista as it will be once the [upstream changes](#upstream-changes) it relies on are released. Today's behavior is in [Workspaces → Settings](workspaces.md#settings) and [Architecture → Shared presentation](../architecture.md#shared-presentation), and it stays in force until this document is approved and implemented.

## The preferences

The Appearance section of [Settings](workspaces.md#settings) holds four preferences, in this order:

| Preference | Choices                            | Default  |
| ---------- | ---------------------------------- | -------- |
| Scheme     | _System_, _Light_, _Dark_          | _System_ |
| Theme      | One of the [themes](#themes)       | Daylight |
| Contrast   | _System_, _Standard_, _More_       | _System_ |
| Motion     | _System_, _All_, _Reduced_, _None_ | _System_ |

Each applies at once, in every workspace, and _System_ follows the operating system and changes with it.

## Scheme and theme

The scheme decides whether the interface is light or dark; the theme decides its colours. They are separate choices: the scheme is chosen first, then the theme from a grid of every theme, each shown as a preview in the scheme now in effect. The list is the same in both schemes; only the previews change.

**Every theme has a light and a dark variant.** That rule is what lets _System_ work with any theme: when the operating system switches, the same theme switches variant. A theme with one variant would leave _System_ nothing to show half the time.

A theme changes everything coloured in the interface: grounds, lines, text, the primary colour, focus rings, text selection, and find matches. Today's rule that selection and find matches are always Daylight, in [the brand guidelines](../guidelines/brand.md#colours), becomes the Daylight theme's rule, not every theme's. Brand surfaces, which are the logo, the app icon, a website, and release notes, keep Daylight whatever the theme, since they are Vista's identity rather than its interface; the logo inside the interface is an open question below.

### Alternatives considered

- **One list of every variant, such as "Ocean Dark" and "Ocean Light".** Rejected: each entry fixes a scheme, so following the operating system needs a separate entry that sits outside the list, and the list doubles in length.
- **A theme for each scheme, such as "Light theme: Daylight" and "Dark theme: Ocean".** Not chosen for now: it is one more control for a need no one has stated, and it is only required if a theme may have a single variant. Moving to it later keeps every user's choice, since the saved theme becomes the starting value of both new fields, but it needs `@codenhub/theme` to follow the system with any light and dark theme, not only a configured pair.

## Themes

| Theme      | Character                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| Daylight   | Today's appearance: ink and paper with Daylight as the primary, selection, and match colour. |
| Neutral    | Monochrome, in the Coden style: greys only, including selection and find matches.            |
| Neon       | A night city: deep indigo grounds with neon magenta and cyan accents.                        |
| Ocean      | Blues and teals.                                                                             |
| Forest     | Greens and warm earth tones.                                                                 |
| Ember      | Charcoal with a vivid red-orange accent.                                                     |
| Cappuccino | Coffee: soft browns and cream, low in chroma.                                                |

Cyberpunk and Tokyo were proposed as two themes and merged into Neon, since both were neon accents on a near-black navy. Each theme's palette is Vista's own; none reproduces an existing editor theme.

A theme is a set of values for Vista's colour tokens, each a `light-dark()` pair, as [Architecture](../architecture.md#shared-presentation) describes. No component names a theme. Every variant, at both contrast levels, meets the ratios [the brand guidelines](../guidelines/brand.md#colours) record for text and lines, and adding a theme adds its measured ratios there.

Themes ship in steps: Daylight and Neutral first, with one more, to prove the token set, then the rest.

## Contrast

_More_ strengthens what the standard level draws below the ratios that text and controls require: muted and faint text, lines, borders, and the hover and selected fills, to at least 4.5:1 for text and 3:1 for lines and boundaries. It is one rule set applied over any theme's tokens, so a new theme needs no contrast work of its own beyond measuring the result. _Standard_ uses the theme as designed, even where the operating system asks for more contrast. A less-contrast level is not offered: `@codenhub/styles` does not read `prefers-contrast: less`, and the need is rare.

The operating system's high-contrast mode (`forced-colors: active`) is not this setting and always applies, whatever Contrast says.

## Motion

| Choice    | Behavior                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _System_  | _All_, or _Reduced_ when the operating system asks for reduced motion.                                                                                                                                                                                                |
| _All_     | Every transition and animation, even when the operating system asks for reduced motion.                                                                                                                                                                               |
| _Reduced_ | Short fades and colour changes stay. Movement, scaling, sliding, and repeating animations go: the logo's entrance shows its last frame at once, and the loader pulses in place, as [the brand guidelines](../guidelines/brand.md#motion) describe for reduced motion. |
| _None_    | No animation or transition at all, fades included. The loader shows a still mark with a label, since it must still say that something is happening.                                                                                                                   |

Motion the user drives directly, such as a dragged tab following the pointer or the list scrolling while dragging near its edge, is not animation and stays under every choice.

Operating systems offer reduced motion as on or off, so _System_ resolves to _All_ or _Reduced_, never _None_. _None_ is Vista's own level.

## Applying the preferences

### Scheme and theme

Scheme and theme are one `@codenhub/theme` choice. Each variant is a theme of its own, named for its theme and scheme, such as `ocean-light` and `ocean-dark`, and each names the other as its `pairedTheme`. The scheme decides how the variant is chosen:

- _Light_ or _Dark_ chooses that variant of the theme, which stays shown whatever the operating system does.
- _System_ chooses the theme following the system: the package shows whichever variant of the pair matches the operating system, switches when it does, and saves the theme and the following together, so neither is forgotten.

Choosing a theme keeps the scheme as it is, and choosing a scheme keeps the theme. Daylight's two variants are the package's `systemTheme`, so a user who has never chosen sees Daylight following the system, as today.

The class the package puts on `<html>` names the theme, not the variant, such as `theme-ocean`, so a theme's CSS is one block of `light-dark()` tokens that covers both variants, and the package's `color-scheme` picks the half.

### Contrast and motion

Contrast and motion are written as attributes on `<html>`, each resolved to one value before CSS reads it:

| Attribute       | Values                    |
| --------------- | ------------------------- |
| `data-contrast` | `standard`, `more`        |
| `data-motion`   | `full`, `reduced`, `none` |

While a preference is _System_, Vista resolves it from the media query and follows its changes. Vista's CSS and `@codenhub/styles` read only the attributes, never `prefers-contrast` or `prefers-reduced-motion` directly, so one place decides and a new interaction only has to say which kind of motion it is. The attributes are set before the first paint, as the theme is, so a reload never shows the wrong appearance first.

### Upstream changes

This design relies on two changes to packages Vista's maintainers also maintain. Each preference ships once its change is released:

- [codenhub/codenhub#583](https://github.com/codenhub/codenhub/issues/583): `@codenhub/theme` follows the system within a chosen theme pair and saves that choice. Until then, choosing _System_ forgets the theme, and choosing a theme fixes the scheme. Themes ship after it.
- [codenhub/codenhub#582](https://github.com/codenhub/codenhub/issues/582): `@codenhub/styles` reads `data-contrast` and `data-motion` as well as the media queries. Until then, the package's components follow only the operating system, and its page-wide reduced-motion reset is a layered `!important` the app cannot override. _Contrast_ and _Motion_ ship after it.

Keeping the theme outside `@codenhub/theme`, as a separate attribute with its own storage, was rejected: it works around the package rather than fixing it, and splits one choice across two stores and two pre-paint steps.

## Storage

The theme and scheme are saved by `@codenhub/theme` under `vista-theme`, as the scheme is today. A saved choice from before themes, `light` or `dark`, becomes Daylight's light or dark variant, so no user sees a change on upgrade. A saved theme that no longer exists, such as one removed in a later version, falls back to Daylight following the system.

Contrast and motion join the editor settings under `vista.settings`, described in [Workspaces → Editor settings](workspaces.md#editor-settings), as `"appearance": { "contrast": "system", "motion": "system" }`, with the same field-by-field fallback.

## Open questions

- **Neon's name.** Neon is a placeholder for the merged Cyberpunk and Tokyo theme.
- **The logo in the interface.** Whether the logo and loader on the start screen keep Daylight under every theme, as a brand surface, or take the theme's primary colour.
- **The scheme as the first control.** Whether the scheme stays a three-way choice above the theme grid or becomes a switch inside it.
