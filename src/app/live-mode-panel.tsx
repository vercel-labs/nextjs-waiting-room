"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { WAITING_ROOM_INIT_PATH } from "@/lib/waiting-room/cookies";

interface Stats {
  activeCount: number;
  capacity: number;
  provider: string;
}

const LIVE_STATS_POLL_INTERVAL_MS = 3000;

export function LiveModePanel({ nextPath }: { nextPath: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  const pollStats = useEffectEvent(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/waiting-room/stats", {
        cache: "no-store",
        signal,
      });
      if (!response.ok || signal.aborted) {
        return;
      }

      const nextStats: Stats = await response.json();
      if (!signal.aborted) {
        setStats(nextStats);
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
    }
  });

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let controller: AbortController | null = null;

    const tick = () => {
      controller = new AbortController();

      pollStats(controller.signal).finally(() => {
        if (!active) {
          return;
        }

        timeoutId = window.setTimeout(tick, LIVE_STATS_POLL_INTERVAL_MS);
      });
    };

    tick();

    return () => {
      active = false;
      controller?.abort();

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);

      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 text-left">
      <div className="flex h-4 items-center gap-2 font-mono text-xs">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span
          className={
            stats ? "text-foreground/70 tabular-nums" : "text-foreground/40"
          }
        >
          {stats
            ? `Active ${stats.activeCount}/${stats.capacity} · ${stats.provider}`
            : "Connecting\u2026"}
        </span>
      </div>

      <p
        className={`mt-3 font-mono text-xs ${stats?.provider === "memory" ? "text-foreground/38" : "invisible"}`}
      >
        Memory provider &mdash; single process only. Use Redis for team testing.
      </p>

      <div className="mt-4 space-y-1">
        <p className="font-mono text-foreground/70 text-xs">
          Share this URL with your team.
        </p>
        <p className="font-mono text-foreground/40 text-xs">
          Everyone joins the same queue.
        </p>
      </div>

      <button
        className="mt-3 rounded-full border border-foreground/10 px-3 py-1 font-mono text-foreground/50 text-xs transition hover:border-foreground/22 hover:text-foreground"
        onClick={handleCopyUrl}
        type="button"
      >
        {copied ? "Copied!" : "Copy URL"}
      </button>

      <form action={WAITING_ROOM_INIT_PATH} className="mt-4" method="GET">
        <input name="next" type="hidden" value={nextPath} />
        <button
          className="w-full rounded-full bg-foreground px-6 py-3 font-medium font-mono text-background text-sm transition hover:opacity-90"
          type="submit"
        >
          Join Queue
        </button>
      </form>

      <p className="mt-3 text-center font-mono text-foreground/40 text-xs">
        or visit{" "}
        <a className="text-foreground/50 hover:text-foreground" href={nextPath}>
          {nextPath}
        </a>{" "}
        directly
      </p>
    </div>
  );
}
