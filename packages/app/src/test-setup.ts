import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach } from "vitest";

import { setMissingKeyHandler, startLanguage, stopLanguage } from "./i18n";

// Animations finish at once, so a part of the shell that leaves is gone when the test looks, as it
// is for a person once the animation has played.
MotionGlobalConfig.skipAnimations = true;

// jsdom parses <dialog> but does not implement the modal API that the toaster's confirm dialogs and
// the unsaved-changes dialog rely on. This minimal shim only toggles the `open` attribute. It does
// not emulate the top layer, inerting, or focus trapping, so tests must assert those contracts
// through component behavior rather than through the browser.
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

// jsdom does no layout, so it leaves out Range's geometry methods. CodeMirror measures text ranges
// after every update and throws without them; empty geometry is enough for it to keep working.
if (typeof Range !== "undefined" && typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = function getClientRects() {
    return Object.assign([], { item: () => null }) as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return new DOMRect();
  };
}

// A key no dictionary has fails the test that asks for it, rather than showing the key.
setMissingKeyHandler((key, locale) => {
  throw new Error(`Missing translation "${key}" in ${locale}`);
});

// Each test starts in English, as jsdom reports `en-US` and storage starts empty, so tests that find an
// element by its English text keep working.
beforeEach(async () => {
  await startLanguage();
});

afterEach(() => {
  cleanup();
  stopLanguage();
  // Settings and the theme persist here; each test starts from the defaults.
  localStorage.clear();
  sessionStorage.clear();
});
