import { App } from "@vista/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { nativeAdapter } from "./adapter";

import "./style.css";

const root = document.querySelector<HTMLElement>("#root");

if (!root) {
  throw new Error("Vista root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App adapter={nativeAdapter} />
  </StrictMode>,
);
