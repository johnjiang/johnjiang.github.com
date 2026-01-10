import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { TerminalContextProvider } from "react-terminal";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <TerminalContextProvider>
        <App />
      </TerminalContextProvider>
    </HashRouter>
  </StrictMode>,
);
