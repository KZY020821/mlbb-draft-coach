"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Registers the service worker and offers "Install app": the browser's own prompt on Android and
// desktop Chrome/Edge, and short instructions on iPhone/iPad, where Safari has no prompt.
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (prompt) {
    return (
      <button
        type="button"
        className="ghost small install-btn"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => undefined);
          setPrompt(null);
        }}
      >
        Install app
      </button>
    );
  }
  if (!ios) return null;
  return (
    <div className="install-ios">
      <button type="button" className="ghost small install-btn" aria-expanded={showTip} onClick={() => setShowTip((v) => !v)}>
        Install app
      </button>
      {showTip && (
        <p className="install-tip" role="status">
          In Safari, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}
