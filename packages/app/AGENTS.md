# packages/app traps

- The same icon renders sharper in one place than another when text above it has a line height that is not a whole pixel, such as 13px at the default 1.5 (19.5px) or 12.5px at 1.45 (18.125px per line). Everything below lands on a fraction of a pixel, and an SVG icon, unlike text, is antialiased at that fraction. Prefer a whole-pixel line height, such as `leading-5` or `leading-[18px]`, on text in a layout that stacks. Seen in Chromium at 100% zoom, with the two _Match system_ buttons in Settings → Appearance (y = 534.625 and 727.375).
