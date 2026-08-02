"use client";

import { useEffect } from "react";

function localStaticResources() {
  const candidates = [
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ...Array.from(
      document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
        "script[src], link[rel='stylesheet'][href]",
      ),
    ).map((element) =>
      element instanceof HTMLScriptElement ? element.src : element.href,
    ),
  ];

  return candidates.filter((candidate) => {
    const url = new URL(candidate, window.location.origin);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/_next/static/")
    );
  });
}

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({
          type: "CACHE_URLS",
          urls: [
            ...localStaticResources(),
            window.location.pathname,
            "/icon-192.png",
            "/icon-512.png",
            "/manifest.webmanifest",
          ],
        });
      })
      .catch(() => undefined);
  }, []);

  return null;
}
