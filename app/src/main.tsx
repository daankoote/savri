import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PresentationBrandRuntime } from "./shared/presentation/PresentationBrandRuntime";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PresentationBrandRuntime>
      <App />
    </PresentationBrandRuntime>
  </React.StrictMode>,
);
