import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./app";

describe("App", () => {
  it("renders Vista for the provided platform", () => {
    const markup = renderToStaticMarkup(<App adapter={{ platform: "web" }} />);

    expect(markup).toContain("Vista");
    expect(markup).toContain('data-platform="web"');
  });
});
