---
status: APPROVED
last_updated: 2026-11-24
scope: The appearance preferences, which are theme, scheme, contrast, and motion, how each is chosen, stored, and applied, what each theme must provide, and the package versions they need.
---

# Appearance

This document describes how Vista's appearance becomes configurable beyond today's light, dark, and system choice. It is approved and not yet implemented. Until it is, today's behavior is in [Workspaces → Settings](workspaces.md#settings) and [Architecture → Shared presentation](../architecture.md#shared-presentation).

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

A theme changes everything coloured in the interface: grounds, lines, text, the primary colour, focus rings, text selection, and find matches. Today's rule that selection and find matches are always Daylight, in [the brand guidelines](../guidelines/brand.md#colours), becomes the Daylight theme's rule, not every theme's. Brand surfaces, which are the logo, the app icon, a website, and release notes, keep Daylight whatever the theme, since they are Vista's identity rather than its interface. That includes the logo and loader inside the interface, such as on the start screen: Daylight is the brand colour, not a theme's primary.

### Alternatives considered

- **One list of every variant, such as "Ocean Dark" and "Ocean Light".** Rejected: each entry fixes a scheme, so following the operating system needs a separate entry that sits outside the list, and the list doubles in length.
- **A theme for each scheme, such as "Light theme: Daylight" and "Dark theme: Ocean".** Not chosen for now: it is one more control for a need no one has stated, and it is only required if a theme may have a single variant. Moving to it later keeps every user's choice, since the saved theme becomes the starting value of both new fields, but it needs `@codenhub/theme` to follow the system with any light and dark theme, not only a configured pair.

## Themes

| Theme      | Character                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| Daylight   | Today's appearance: ink and paper with Daylight as the primary, selection, and match colour. |
| Neutral    | Monochrome, in the Coden style: greys only, including selection and find matches.            |
| Midnight   | Deep indigo grounds with magenta and cyan accents.                                           |
| Ocean      | Blues and teals.                                                                             |
| Forest     | Greens and warm earth tones.                                                                 |
| Ember      | Charcoal with a vivid red-orange accent.                                                     |
| Cappuccino | Coffee: soft browns and cream, low in chroma.                                                |

Cyberpunk and Tokyo were proposed as two themes and merged into Midnight, since both were bright accents on a near-black navy. The name describes colours, as every theme's does: Neon and Cyberpunk suggest glow or a futuristic look, which a theme does not change, and Tokyo suggests the Tokyo Night editor theme. Each theme's palette is Vista's own; none reproduces an existing editor theme.

A theme is a value, as a `light-dark()` pair, for every colour token `packages/app/src/style.css` defines or sets, including the `@codenhub/styles` tokens it overrides, as [Architecture](../architecture.md#shared-presentation) describes. The stylesheet is the list: a theme sets every token in it, and a token added later gets a value in every theme. No component names a theme. Every variant meets the ratios [Contrast](#contrast) sets for each level, and adding a theme records its measured pairings in [the brand guidelines](../guidelines/brand.md#colours).

Themes ship in steps: Daylight and Neutral first, with one more, to prove the token set, then the rest.

## Contrast

At _Standard_, every variant meets WCAG 2.2 AA: text at 4.5:1 against its ground, and the boundaries that identify a control at 3:1. Dividers, and faint text that only supports other text, such as line numbers, may sit lower by design. _More_ raises those: muted and faint text to at least 4.5:1, and every line, border, and hover or selected fill to at least 3:1. It is one rule set applied over any theme's tokens, so a new theme needs no contrast work of its own beyond measuring the result. _Standard_ uses the theme as designed, even where the operating system asks for more contrast. A less-contrast level is not offered: `@codenhub/styles` does not read `prefers-contrast: less`, and the need is rare.

The operating system's high-contrast mode (`forced-colors: active`) is not this setting and always applies, whatever Contrast says.

## Motion

| Choice    | Behavior                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _System_  | _All_, or _Reduced_ when the operating system asks for reduced motion.                                                                                                                                                                                                                                                                                            |
| _All_     | Every transition and animation, even when the operating system asks for reduced motion.                                                                                                                                                                                                                                                                           |
| _Reduced_ | Colour and opacity transitions stay. Movement, scaling, sliding, and keyframe animations go, fade-ins included: the logo's entrance shows its last frame at once. The loader is the one exception: it pulses in place, as [the brand guidelines](../guidelines/brand.md#motion) describe for reduced motion, since it must still say that something is happening. |
| _None_    | No animation or transition at all, fades included. The loader shows a still mark with a label, since it must still say that something is happening.                                                                                                                                                                                                               |

Motion the user drives directly, such as a dragged tab following the pointer or the list scrolling while dragging near its edge, is not animation and stays under every choice.

Operating systems offer reduced motion as on or off, so _System_ resolves to _All_ or _Reduced_, never _None_. _None_ is Vista's own level.

## Applying the preferences

### Scheme and theme

Scheme and theme are one `@codenhub/theme` choice. Each variant is a theme of its own, named for its theme and scheme, such as `ocean-light` and `ocean-dark`, and each names the other as its `pairedTheme`. Daylight follows the same rule, as `daylight-light` and `daylight-dark`; no variant is named a bare `light` or `dark`, since those name a scheme, not a theme. The scheme decides how the variant is chosen:

- _Light_ or _Dark_ chooses that variant of the theme, which stays shown whatever the operating system does.
- _System_ chooses the theme following the system, with `set(name, { followSystem: true })`: the package shows whichever variant of the pair matches the operating system, switches when it does, and saves the theme and the following together, so neither is forgotten.

Choosing a theme keeps the scheme as it is, and choosing a scheme keeps the theme. Daylight's two variants are the package's `systemTheme`, so a user who has never chosen sees Daylight following the system, as today.

The class the package puts on `<html>` names the theme, not the variant, such as `theme-ocean`, through a `className` function that drops the scheme from the variant's name, so a theme's CSS is one block of `light-dark()` tokens that covers both variants, and the package's `color-scheme` picks the half.

### Contrast and motion

Contrast and motion are written as attributes on `<html>`, each resolved to one value before CSS reads it:

| Attribute       | Values                   |
| --------------- | ------------------------ |
| `data-contrast` | `standard`, `more`       |
| `data-motion`   | `full`, `reduce`, `none` |

The values are the ones `@codenhub/styles` reads; `reduce` is spelled as in `prefers-reduced-motion: reduce`, the query it stands in for, while the setting is labelled _Reduced_. Vista always sets both attributes. While a preference is _System_, Vista resolves it from the media query and follows its changes. Vista's own CSS reads only the attributes, never `prefers-contrast` or `prefers-reduced-motion`, so one place decides and a new interaction only has to say which kind of motion it is. `@codenhub/styles` falls back to the media queries only when an attribute is absent, which in Vista it never is, so the attribute is the one source in both. The attributes are set before the first paint, as the theme is, so a reload never shows the wrong appearance first.

### Package versions

This design needs two releases of packages Vista's maintainers also maintain:

- `@codenhub/theme` 0.3.0 or newer, which follows the system within a chosen theme pair and saves that choice ([codenhub/codenhub#583](https://github.com/codenhub/codenhub/issues/583)).
- `@codenhub/styles` 0.11.0 or newer, which reads `data-contrast` and `data-motion` in place of the media queries ([codenhub/codenhub#582](https://github.com/codenhub/codenhub/issues/582)). Under `reduce`, its page-wide reset replaces the properties every transition names with its own list of colour, opacity, and visibility properties, so a movement lands at once while a fade still runs, which is the _Reduced_ rule. It keeps each transition's durations and pairs them with its list by position, so a Vista transition that should keep its fade gives all its properties one duration, as the package's accessibility guide describes. It also ends every keyframe animation at once, since a stylesheet cannot tell what an animation moves; under `none`, it ends every transition too.

The reset is a layered `!important`, which no unlayered rule overrides. The loader's reduced-motion pulse is therefore declared `!important` under `:root[data-motion="reduce"]`, in a layer ordered before the package's `base` layer, as the package's accessibility guide shows for an essential animation. The reset also keeps each animation's delay, so the logo's staggered entrance would still appear piece by piece; under `reduce` and `none`, Vista removes the entrance animation itself, with `animation: none`, so its last frame shows at once.

Keeping the theme outside `@codenhub/theme`, as a separate attribute with its own storage, was rejected: it works around the package rather than fixing it, and splits one choice across two stores and two pre-paint steps.

## Storage

The theme and scheme are saved by `@codenhub/theme` under `vista-theme`, as the scheme is today. A saved theme that no longer exists, such as one removed in a later version, falls back to Daylight following the system. A choice saved before themes, `light` or `dark`, is one of these: it is not migrated, since Vista had no users to keep when this was decided, and the fallback is the default anyway.

Contrast and motion join the editor settings under `vista.settings`, described in [Workspaces → Editor settings](workspaces.md#editor-settings), as `"appearance": { "contrast": "system", "motion": "system" }`, with the same field-by-field fallback.

## Open questions

- **The scheme as the first control.** Whether the scheme stays a three-way choice above the theme grid or becomes a switch inside it. Settled during implementation.
