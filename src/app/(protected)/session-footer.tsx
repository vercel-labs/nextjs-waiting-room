"use client";

import { useEffect, useRef, useState } from "react";

interface SessionFooterProps {
  activeCount?: number;
  backendLabel?: string;
  sessionId: string;
}

export function SessionFooter({
  activeCount,
  backendLabel,
  sessionId,
}: SessionFooterProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  const accessLabel = "Access";
  const accessValue =
    activeCount === undefined ? "Token verified" : `${activeCount} active`;

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);

      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 1600);
    } catch (error) {
      console.error("[WaitingRoom] Failed to copy session ID:", error);
    }
  };

  return (
    <footer className="border-foreground/8 border-t">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-3">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
        </span>
        <span className="font-mono text-foreground/40 text-xs uppercase tracking-[0.2em]">
          {accessLabel}
        </span>
        <span className="font-mono text-foreground/70 text-xs tabular-nums">
          {accessValue}
        </span>
        {backendLabel ? (
          <>
            <span className="font-mono text-foreground/20 text-xs">·</span>
            <span className="font-mono text-foreground/40 text-xs uppercase tracking-[0.2em]">
              Backend
            </span>
            <span className="font-mono text-foreground/70 text-xs tabular-nums">
              {backendLabel}
            </span>
          </>
        ) : null}
        <div className="flex-1" />
        <div className="flex shrink items-center gap-3 overflow-hidden">
          <span className="font-mono text-foreground/40 text-xs uppercase tracking-[0.2em]">
            Session
          </span>
          <span className="min-w-0 truncate font-mono text-foreground/70 text-xs">
            {sessionId}
          </span>
          <button
            className="shrink-0 font-mono text-foreground/40 text-xs transition hover:text-foreground"
            onClick={handleCopy}
            type="button"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </footer>
  );
}
