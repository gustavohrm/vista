import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./app";

describe("App", () => {
  it.each(["web", "native"] as const)("renders Vista for the %s host", (platform) => {
    render(<App adapter={{ platform }} />);

    expect(screen.getByRole("heading", { name: "Vista", level: 1 })).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("data-platform", platform);
  });
});
