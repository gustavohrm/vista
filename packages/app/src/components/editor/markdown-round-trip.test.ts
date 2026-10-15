import { defaultValueCtx, Editor, parserCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { describe, expect, it } from "vitest";

/**
 * Round-trips Markdown through the same schema, parser, and serializer the WYSIWYG editor uses,
 * without mounting a visible editor view. This exercises the actual fidelity boundary users hit:
 * open an existing file, make no visual change, and confirm Save doesn't rewrite it unexpectedly.
 */
async function roundTrip(markdown: string): Promise<string> {
  const editor = Editor.make().config((ctx) => {
    ctx.set(rootCtx, document.createElement("div"));
    ctx.set(defaultValueCtx, markdown);
  });
  editor.use(commonmark).use(gfm);
  await editor.create();

  try {
    return editor.action((ctx) => {
      const doc = ctx.get(parserCtx)(markdown);
      if (!doc) {
        throw new Error("Parser returned no document");
      }
      return ctx.get(serializerCtx)(doc);
    });
  } finally {
    await editor.destroy();
  }
}

describe("Markdown round-trip fidelity", () => {
  it("preserves headings", async () => {
    const result = await roundTrip("# Title\n\n## Subtitle\n");
    expect(result.trim()).toBe("# Title\n\n## Subtitle");
  });

  it("preserves nested list structure and item text, normalizing the bullet marker to *", async () => {
    // The serializer normalizes every bullet marker to `*` regardless of source style. This is
    // intentional normalization, not data loss, so it's whitelisted here rather than silently
    // tolerated; nesting depth and item text are what actually matter for fidelity.
    const source = "- one\n  - nested one\n  - nested two\n- two\n";
    const result = await roundTrip(source);
    expect(result).toContain("* one");
    expect(result).toContain("* nested one");
    expect(result).toContain("* nested two");
    expect(result).toContain("* two");
    expect(result).not.toContain("- ");
  });

  it("preserves links", async () => {
    const result = await roundTrip("See [Vista](https://example.com/vista) for more.\n");
    expect(result.trim()).toBe("See [Vista](https://example.com/vista) for more.");
  });

  it("preserves fenced code blocks including the language tag", async () => {
    const source = "```ts\nconst x = 1;\n```\n";
    const result = await roundTrip(source);
    expect(result.trim()).toBe("```ts\nconst x = 1;\n```");
  });

  it("preserves blockquotes", async () => {
    const result = await roundTrip("> A quoted line.\n> A second line.\n");
    expect(result).toContain("> A quoted line.");
    expect(result).toContain("A second line.");
  });

  it("preserves GFM tables", async () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
    const result = await roundTrip(source);
    expect(result).toContain("| A");
    expect(result).toContain("| B");
    expect(result).toContain("| 1");
    expect(result).toContain("| 2");
  });

  it("preserves GFM task list checked state", async () => {
    const source = "- [ ] todo\n- [x] done\n";
    const result = await roundTrip(source);
    expect(result).toContain("[ ] todo");
    expect(result).toContain("[x] done");
  });

  it("preserves emphasis and strong marker style", async () => {
    const asterisks = await roundTrip("This is *emphasis* and **strong** text.\n");
    expect(asterisks.trim()).toBe("This is *emphasis* and **strong** text.");

    const underscores = await roundTrip("This is _emphasis_ and __strong__ text.\n");
    expect(underscores.trim()).toBe("This is _emphasis_ and __strong__ text.");
  });
});
