import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { I18nBootstrap } from "./components/I18nBootstrap";
import { applyUiDirection } from "./lib/apply-ui-direction";
import { markAfterPaint, markOnce } from "./lib/performance";
import { resolveUiLocale } from "./lib/ui-locale";
import { applyUiTheme, resolveUiTheme } from "./lib/ui-theme";
import { desktopBridge } from "./lib/desktop";
import "./styles.css";

markOnce("rk:renderer:module-evaluated");
applyUiDirection(resolveUiLocale());
applyUiTheme(resolveUiTheme());
if (desktopBridge()?.platform === "win32") {
  document.documentElement.style.setProperty("--rk-titlebar-height", "36px");
}

function PerformanceProbe() {
  useLayoutEffect(() => {
    markOnce("rk:renderer:first-react-commit");
    markAfterPaint("rk:renderer:first-react-painted");
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="flex h-full flex-col">
      <div className="rk-desktop-titlebar" aria-hidden="true" />
      <div className="min-h-0 flex-1">
        <PerformanceProbe />
        <I18nBootstrap>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </I18nBootstrap>
      </div>
    </div>
  </StrictMode>,
);
