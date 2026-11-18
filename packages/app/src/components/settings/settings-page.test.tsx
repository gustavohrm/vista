import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { SettingsPage } from "./settings-page";

function Shell({ isOpen }: { isOpen: boolean }) {
  return (
    <>
      <button type="button">Opener</button>
      {isOpen && (
        <SettingsPage section="appearance" onSectionChange={() => undefined} onClose={() => undefined}>
          <p>Section</p>
        </SettingsPage>
      )}
    </>
  );
}

describe("SettingsPage", () => {
  it("gives focus back to what had it when it closes, under StrictMode too", () => {
    const { rerender } = render(<Shell isOpen={false} />, { wrapper: StrictMode });
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();

    rerender(<Shell isOpen />);
    expect(opener).not.toHaveFocus();
    rerender(<Shell isOpen={false} />);

    expect(opener).toHaveFocus();
  });
});
