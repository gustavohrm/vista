import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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

afterEach(cleanup);
