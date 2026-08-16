import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PresentationBrandProvider } from "./shared/presentation/PresentationBrandProvider";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PresentationBrandProvider>
      <App />
    </PresentationBrandProvider>
  </React.StrictMode>,
);
