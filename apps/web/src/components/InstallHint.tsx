"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY = "install-hint-dismissed";

/**
 * Bottom toast (fixed, so it never shifts layout). Chrome/Android get a real
 * install button via beforeinstallprompt; iOS Safari gets the Share-sheet tip.
 * Shown on a second visit only, and never again once dismissed.
 */
export function InstallHint() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let visits = 0;
    try {
      if (localStorage.getItem(KEY)) return;
      visits = Number(localStorage.getItem("visits") ?? 0) + 1;
      localStorage.setItem("visits", String(visits));
    } catch {
      return;
    }
    const standalone =
      matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || visits < 2) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    let t: number | undefined;
    if (isIos) {
      setIos(true);
      t = window.setTimeout(() => setShow(true), 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.clearTimeout(t);
    };
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <div role="dialog" aria-label="Install WarriorWatch" className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-md rounded-2xl border border-line bg-card p-4 shadow-lg">
      <p className="text-sm font-semibold">Check the gym in one tap</p>
      <p className="mt-1 text-sm text-muted">
        {ios ? (
          <>
            Tap <span aria-label="the Share button">Share ⎋</span>, then <strong className="text-fg">Add to Home Screen</strong>.
          </>
        ) : (
          "Add WarriorWatch to your home screen. It opens like an app."
        )}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
          Not now
        </button>
        {evt && (
          <button
            type="button"
            onClick={async () => {
              await evt.prompt();
              await evt.userChoice;
              dismiss();
            }}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white dark:text-zinc-950"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
