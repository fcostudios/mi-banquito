"use client";

import { useEffect, useState } from "react";
import { queuedCountLabel } from "@/lib/offline/outbox";

type OutboxCountMessage = {
  type?: string;
  count?: number;
};

function normalizeCount(count: number | undefined): number {
  return Number.isFinite(count) && count && count > 0 ? count : 0;
}

export function OfflineQueueIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const handleWindowEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      setCount(normalizeCount(detail?.count));
    };
    const handleServiceWorkerMessage = (event: MessageEvent<OutboxCountMessage>) => {
      if (event.data?.type === "MI_BANQUITO_OUTBOX_COUNT") {
        setCount(normalizeCount(event.data.count));
      }
    };

    window.addEventListener("mi-banquito:outbox-count", handleWindowEvent);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      window.removeEventListener("mi-banquito:outbox-count", handleWindowEvent);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);

  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="fixed bottom-20 right-4 z-50 rounded-md border border-warning bg-surface px-4 py-3 text-sm font-semibold text-text-primary shadow-lg"
      aria-label={queuedCountLabel(count)}
    >
      {queuedCountLabel(count)}
    </button>
  );
}
