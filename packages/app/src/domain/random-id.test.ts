import { afterEach, describe, expect, it, vi } from "vitest";

import { randomId } from "./random-id";

describe("randomId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses randomUUID when the context provides it", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-2222-4333-8444-555555555555");
    expect(randomId()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("still returns a distinct id outside a secure context, where randomUUID is missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const first = randomId();
      expect(first).toMatch(/^[0-9a-f]{32}$/);
      expect(randomId()).not.toBe(first);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
