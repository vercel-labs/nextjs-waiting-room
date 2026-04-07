"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { WaitingRoomStatus } from "@/lib/waiting-room/types";
import { QueueJourneyCard } from "./queue-journey-card";

const FAST_POLL_INTERVAL_MS = 5000;
const MEDIUM_POLL_INTERVAL_MS = 15_000;
const SLOW_POLL_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

interface Props {
  nextPath: string;
}

interface QueueDisplayState {
  aheadCount: number;
  displayEstimatedWait: number;
  displayPosition: number | null;
  queueProgress: number;
  simulatedAdmitAt: number | null;
  totalSlots: number;
}

function withJitter(intervalMs: number): number {
  const variance = Math.round(intervalMs * 0.15);
  const offset = Math.round((Math.random() * 2 - 1) * variance);
  return Math.max(FAST_POLL_INTERVAL_MS, intervalMs + offset);
}

function resolveNextPollInterval(status: WaitingRoomStatus | null): number {
  if (!status || status.status === "unavailable") {
    return MEDIUM_POLL_INTERVAL_MS;
  }

  if (status.status !== "queued") {
    return FAST_POLL_INTERVAL_MS;
  }

  if (status.estimatedWait >= 15 * 60) {
    return MAX_BACKOFF_MS;
  }

  if (status.estimatedWait >= 5 * 60) {
    return SLOW_POLL_INTERVAL_MS;
  }

  if (
    status.estimatedWait >= 60 ||
    (status.position ?? Number.POSITIVE_INFINITY) > 25
  ) {
    return MEDIUM_POLL_INTERVAL_MS;
  }

  return FAST_POLL_INTERVAL_MS;
}

function resolveQueueDisplayState(
  status: WaitingRoomStatus | null,
  clockMs: number
): QueueDisplayState {
  if (!status || status.status !== "queued") {
    return {
      aheadCount: 0,
      displayEstimatedWait: 0,
      displayPosition: null,
      queueProgress: 0.16,
      simulatedAdmitAt: null,
      totalSlots: 1,
    };
  }

  const simulatedAdmitAt = status.demo?.admitAt ?? null;
  const simulatedSlotIntervalSeconds = status.demo?.slotIntervalSeconds ?? null;

  const displayEstimatedWait = simulatedAdmitAt
    ? Math.max(0, Math.ceil((simulatedAdmitAt - clockMs) / 1000))
    : status.estimatedWait;

  const displayPosition =
    simulatedAdmitAt && simulatedSlotIntervalSeconds
      ? Math.max(
          1,
          Math.ceil(displayEstimatedWait / simulatedSlotIntervalSeconds) + 1
        )
      : status.position;

  let queueProgress = 0.16;
  if (status.demo && status.demo.totalWaitSeconds > 0) {
    queueProgress = 1 - displayEstimatedWait / status.demo.totalWaitSeconds;
  } else if (displayPosition !== null) {
    queueProgress = Math.max(0.12, Math.min(0.88, 1 / displayPosition));
  }

  let aheadCount = Math.max(status.demo?.peopleAhead ?? 0, 0);
  if (displayPosition !== null) {
    aheadCount = Math.max(displayPosition - 1, 0);
  }

  let totalSlots = Math.max(displayPosition ?? 1, 1);
  if (status.demo?.peopleAhead !== undefined) {
    totalSlots = status.demo.peopleAhead + 1;
  }

  return {
    aheadCount,
    displayEstimatedWait,
    displayPosition,
    queueProgress,
    simulatedAdmitAt,
    totalSlots,
  };
}

export function QueuePositionClient({ nextPath }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<WaitingRoomStatus | null>(null);
  const [error, setError] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const backoffRef = useRef(withJitter(MEDIUM_POLL_INTERVAL_MS));

  const {
    aheadCount,
    displayEstimatedWait,
    displayPosition,
    queueProgress,
    simulatedAdmitAt,
    totalSlots,
  } = resolveQueueDisplayState(status, clockMs);

  const poll = useEffectEvent(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/waiting-room/status", {
        cache: "no-store",
        signal,
      });
      const data: WaitingRoomStatus = await res.json();
      if (!res.ok && data.status !== "unavailable") {
        throw new Error(`HTTP ${res.status}`);
      }

      if (signal.aborted) {
        return;
      }

      if (data.status === "admitted") {
        router.replace(nextPath);
        return;
      }

      backoffRef.current = withJitter(resolveNextPollInterval(data));
      startTransition(() => {
        setError(false);
        setLoading(false);
        setStatus(data);
      });
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setLoading(false);
      setError(true);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    }
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let controller: AbortController | null = null;

    const tick = () => {
      controller = new AbortController();

      poll(controller.signal).finally(() => {
        if (!active) {
          return;
        }

        timeoutId = setTimeout(tick, backoffRef.current);
      });
    };

    timeoutId = setTimeout(tick, 0);

    return () => {
      active = false;
      controller?.abort();

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!simulatedAdmitAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setClockMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [simulatedAdmitAt]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.025] p-4 text-center">
          <div className="font-mono text-foreground/40 text-xs uppercase tracking-[0.2em]">
            Finding your place in line
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 font-mono text-foreground/25 text-xs">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
          </span>
          Checking queue status
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status?.status === "queued" ? (
        <QueueJourneyCard
          aheadCount={aheadCount}
          estimatedWaitSeconds={displayEstimatedWait}
          position={displayPosition}
          progress={queueProgress}
          totalSlots={totalSlots}
        />
      ) : (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-600 text-sm">
          We&apos;re having trouble checking queue status right now. We&apos;ll
          keep retrying automatically.
        </div>
      )}

      {error && (
        <div className="text-amber-500 text-sm">
          Having trouble checking the queue. Retrying automatically with a
          slower cadence.
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 font-mono text-foreground/25 text-xs">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
        </span>
        Checking for an open spot
      </div>
    </div>
  );
}
