import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const APP_UPDATE_CHECK_PARAM = "app-update-check";

removeAppUpdateCheckParam();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function removeAppUpdateCheckParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(APP_UPDATE_CHECK_PARAM)) return;

  url.searchParams.delete(APP_UPDATE_CHECK_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

document.addEventListener("contextmenu", (event) => {
  if (!isEditableTarget(event.target)) event.preventDefault();
});

document.addEventListener("dragstart", (event) => {
  if (!isEditableTarget(event.target)) event.preventDefault();
});

document.addEventListener(
  "gesturestart",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

async function lockPortraitOrientation(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "portrait" | "portrait-primary" | "portrait-secondary") => Promise<void>;
    };
    await orientation.lock?.("portrait");
  } catch {
    // Browsers often allow orientation lock only after install or fullscreen.
  }
}

void lockPortraitOrientation();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void lockPortraitOrientation();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => undefined);
  });
}
