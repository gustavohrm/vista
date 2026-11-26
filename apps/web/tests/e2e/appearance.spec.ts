import { expect, test, type Page } from "./test";

// The ratios `docs/specs/appearance.md` sets for every theme, in each scheme, at each contrast level,
// measured on the colours the browser paints. The pairings and their results are recorded in
// `docs/guidelines/brand.md`; run with `VISTA_PRINT_CONTRAST=1` to print them.

const THEMES = ["daylight", "neutral", "midnight", "ocean", "forest", "ember", "cappuccino"] as const;
const SCHEMES = ["light", "dark"] as const;
const LEVELS = ["standard", "more"] as const;

/** A colour drawn over others: the token names, bottom first, each painted over the one before. */
type Layers = readonly string[];

interface Pairing {
  /** What the pairing is, as the brand guidelines name it. */
  name: string;
  fore: Layers;
  back: Layers;
  /** The least ratio the level asks for, or 0 for one that is only measured. */
  min: number;
}

const GROUNDS = ["--color-frame", "--color-chrome", "--color-pop"];

function pairings(level: (typeof LEVELS)[number]): Pairing[] {
  const list: Pairing[] = [];
  for (const ground of GROUNDS) {
    for (const text of ["--color-text", "--color-text-strong", "--color-text-muted", "--color-text-secondary"]) {
      list.push({ name: `${text} on ${ground}`, fore: [ground, text], back: [ground], min: 4.5 });
    }
    list.push({
      name: `--color-text-faint on ${ground}`,
      fore: [ground, "--color-text-faint"],
      back: [ground],
      min: level === "more" ? 4.5 : 0,
    });
  }
  for (const ground of ["--color-frame", "--color-chrome"]) {
    list.push(
      {
        name: `--color-text on --color-hover over ${ground}`,
        fore: [ground, "--color-text"],
        back: [ground, "--color-hover"],
        min: 4.5,
      },
      {
        name: `--color-text-strong on --color-selected over ${ground}`,
        fore: [ground, "--color-text-strong"],
        back: [ground, "--color-selected"],
        min: 4.5,
      },
      {
        name: `--color-focus-ring over ${ground}`,
        fore: [ground, "--focus-ring"],
        back: [ground],
        min: 3,
      },
    );
    const boundary = level === "more" ? 3 : 0;
    for (const line of ["--color-line", "--color-line-strong"]) {
      list.push({ name: `${line} on ${ground}`, fore: [ground, line], back: [ground], min: boundary });
    }
    for (const fill of ["--color-hover", "--color-selected"]) {
      list.push({ name: `${fill} over ${ground}`, fore: [ground, fill], back: [ground], min: boundary });
    }
  }
  list.push(
    { name: "--color-primary on --color-frame", fore: ["--color-primary"], back: ["--color-frame"], min: 3 },
    {
      name: "--color-control-border on --color-frame",
      fore: ["--color-control-border"],
      back: ["--color-frame"],
      min: 3,
    },
    {
      name: "--color-action-text on --color-action",
      fore: ["--color-action-text"],
      back: ["--color-action"],
      min: 4.5,
    },
    {
      name: "--color-action-text on --color-action-hover",
      fore: ["--color-action-text"],
      back: ["--color-action-hover"],
      min: 4.5,
    },
    {
      name: "--color-primary-contrast on --color-primary",
      fore: ["--color-primary-contrast"],
      back: ["--color-primary"],
      min: 4.5,
    },
    {
      name: "--color-selection-text on --color-selection",
      fore: ["--color-selection-text"],
      back: ["--color-selection"],
      min: 4.5,
    },
    {
      name: "--color-text on --color-highlight over --color-frame",
      fore: ["--color-frame", "--color-text"],
      back: ["--color-frame", "--color-highlight"],
      min: 4.5,
    },
    {
      name: "--color-tooltip-contrast on --color-tooltip",
      fore: ["--color-tooltip-contrast"],
      back: ["--color-tooltip"],
      min: 4.5,
    },
  );
  return list;
}

/** Paints each pairing's layers on a canvas and returns the WCAG contrast ratio of each. */
async function measure(page: Page, list: Pairing[]): Promise<number[]> {
  return page.evaluate((items) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("No 2D canvas");
    }
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const paint = (layers: readonly string[]) => {
      context.clearRect(0, 0, 1, 1);
      for (const token of layers) {
        context.fillStyle = resolve(token);
        context.fillRect(0, 0, 1, 1);
      }
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratios = items.map(({ fore, back }) => {
      const a = luminance(paint(fore));
      const b = luminance(paint(back));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    probe.remove();
    return ratios;
  }, list);
}

for (const theme of THEMES) {
  for (const scheme of SCHEMES) {
    for (const level of LEVELS) {
      test(`${theme} ${scheme} meets the ${level} contrast ratios`, async ({ page }) => {
        await page.addInitScript(
          ({ variant, contrast }) => {
            localStorage.setItem("vista-theme", variant);
            localStorage.setItem(
              "vista.settings",
              JSON.stringify({ version: 1, appearance: { contrast, motion: "system" } }),
            );
          },
          { variant: `${theme}-${scheme}`, contrast: level },
        );
        await page.goto("/");
        const html = page.locator("html");
        await expect(html).toHaveClass(new RegExp(`\\btheme-${theme}\\b`));
        await expect(html).toHaveAttribute("data-contrast", level);
        await expect(html).toHaveCSS("color-scheme", scheme);

        const list = pairings(level);
        const ratios = await measure(page, list);
        const results = list.map((pairing, index) => ({
          ...pairing,
          ratio: ratios[index] ?? 0,
        }));
        if (process.env.VISTA_PRINT_CONTRAST) {
          process.stdout.write(
            `${theme} ${scheme} ${level}\n` +
              results
                .map(({ name, ratio, min }) => `  ${ratio.toFixed(2)}${min ? ` (>= ${min})` : ""}  ${name}\n`)
                .join(""),
          );
        }
        const failing = results
          .filter(({ ratio, min }) => ratio < min)
          .map(({ name, ratio, min }) => `${name}: ${ratio.toFixed(2)} < ${min}`);
        expect(failing).toEqual([]);
      });
    }
  }
}

/**
 * The contrast of an element's top border against what is behind it, as painted: the backgrounds of
 * its ancestors, each over the one before, on white.
 */
async function measureBorder(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("No 2D canvas");
      }
      const grounds: string[] = [];
      for (let node = element.parentElement; node; node = node.parentElement) {
        grounds.unshift(getComputedStyle(node).backgroundColor);
      }
      const paint = (colors: readonly string[]) => {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 1, 1);
        for (const color of colors) {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
        }
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const luminance = (rgb: number[]) => {
        const [r = 0, g = 0, b = 0] = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = luminance(paint([...grounds, getComputedStyle(element).borderTopColor]));
      const b = luminance(paint(grounds));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
}

// What the token pairings above cannot show: the border the styles package draws on a control, which
// it mixes from the token. A field rests lighter at Standard by the package's design, as Contrast in
// `docs/specs/appearance.md` records; an unchecked toggle has only its border to show it.
for (const theme of THEMES) {
  for (const scheme of SCHEMES) {
    for (const level of LEVELS) {
      test(`${theme} ${scheme} draws field and toggle borders at the ${level} ratios`, async ({ page }) => {
        await page.addInitScript(
          ({ variant, contrast }) => {
            localStorage.setItem("vista-theme", variant);
            localStorage.setItem(
              "vista.settings",
              JSON.stringify({ version: 1, appearance: { contrast, motion: "none" } }),
            );
          },
          { variant: `${theme}-${scheme}`, contrast: level },
        );
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("data-contrast", level);
        await page.keyboard.press("Control+Comma");

        await page.getByRole("button", { name: "Editor", exact: true }).click();
        const toggle = await measureBorder(page, ".switch:not(:checked)");
        await page.getByRole("button", { name: "Files", exact: true }).click();
        // Away from the field, so it shows its resting border.
        await page.mouse.move(0, 0);
        const field = await measureBorder(page, ".ipt");

        expect(toggle, "unchecked switch").toBeGreaterThanOrEqual(3);
        expect(field, "text field at rest").toBeGreaterThanOrEqual(level === "more" ? 3 : 2.1);
      });
    }
  }
}

test("follows the operating system's contrast and motion while both are System", async ({ page }) => {
  await page.emulateMedia({ contrast: "more", reducedMotion: "reduce" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-contrast", "more");
  await expect(html).toHaveAttribute("data-motion", "reduce");

  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "no-preference" });
  await expect(html).toHaveAttribute("data-contrast", "standard");
  await expect(html).toHaveAttribute("data-motion", "full");
});

test("plays a motion preview only while its card is pointed at, even with motion set to None", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("vista.settings", JSON.stringify({ version: 1, appearance: { motion: "none" } }));
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "none");
  await page.keyboard.press("Control+Comma");
  const motion = page.getByRole("radiogroup", { name: "Motion" });
  const mark = (level: string) => motion.locator(`.vista-motion-mark[data-preview="${level}"]`);
  await expect(mark("all")).toHaveCSS("animation-name", "none");

  await motion.getByText("All", { exact: true }).hover();
  await expect(mark("all")).toHaveCSS("animation-name", "vista-motion-slide");
  await motion.getByText("Reduced", { exact: true }).hover();
  await expect(mark("all")).toHaveCSS("animation-name", "none");
  await expect(mark("reduced")).toHaveCSS("animation-name", "vista-pulse");
  await motion.getByText("None", { exact: true }).hover();
  await expect(mark("none")).toHaveCSS("animation-name", "none");
});
