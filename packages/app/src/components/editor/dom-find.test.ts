import { afterEach, describe, expect, it } from "vitest";

import { createDomFindTarget } from "./dom-find";

const query = (text: string) => ({ text, caseSensitive: false, wholeWord: false, regexp: false });

function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return { root, target: createDomFindTarget(() => root) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createDomFindTarget", () => {
  it("counts matches in text and in field values", () => {
    const { target } = mount('<p>Bob and bob</p><input value="BOB" /><input value="Alice" />');

    expect(target.search(query("bob"))).toEqual({ total: 3, current: 1, invalid: false });
  });

  it("marks the current field match and moves it with next and previous, wrapping", () => {
    const { root, target } = mount('<input value="one" /><input value="two" /><input value="one" />');
    const [first, second, third] = root.querySelectorAll("input");

    target.search(query("one"));
    expect(first).toHaveAttribute("data-find-match", "current");
    expect(second).not.toHaveAttribute("data-find-match");
    expect(third).toHaveAttribute("data-find-match", "");

    expect(target.findNext()).toMatchObject({ current: 2 });
    expect(third).toHaveAttribute("data-find-match", "current");
    expect(target.findNext()).toMatchObject({ current: 1 });
    expect(target.findPrevious()).toMatchObject({ current: 2 });
  });

  it("keeps the current match when the same query runs again", () => {
    const { target } = mount("<p>a a a</p>");
    target.search(query("a"));
    target.findNext();

    expect(target.refresh()).toMatchObject({ total: 3, current: 2 });
  });

  it("does not replace", () => {
    const { target } = mount("<p>text</p>");
    target.search(query("text"));

    expect(target.canReplace).toBe(false);
    expect(target.replaceAll("other")).toMatchObject({ total: 1 });
  });

  it("reports an invalid regular expression", () => {
    const { target } = mount("<p>text</p>");

    expect(target.search({ ...query("("), regexp: true })).toMatchObject({ total: 0, invalid: true });
  });

  it("removes its marks when cleared", () => {
    const { root, target } = mount('<input value="x" />');
    target.search(query("x"));

    target.clear();

    expect(root.querySelector("[data-find-match]")).toBeNull();
  });
});
