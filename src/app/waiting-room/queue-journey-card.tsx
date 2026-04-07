import type { CSSProperties } from "react";

interface QueueJourneyCardProps {
  aheadCount: number;
  estimatedWaitSeconds: number;
  position: number | null;
  progress: number;
  totalSlots: number;
}

const MAX_TRACK_MARKERS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatWait(seconds: number): string {
  if (seconds <= 0) {
    return "Opening now";
  }

  if (seconds < 60) {
    return `~${Math.ceil(seconds)}s`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} min${minutes > 1 ? "s" : ""}`;
}

export function QueueJourneyCard({
  aheadCount,
  estimatedWaitSeconds,
  position,
  progress,
  totalSlots,
}: QueueJourneyCardProps) {
  const markerCount = clamp(totalSlots, 2, MAX_TRACK_MARKERS);
  const normalizedProgress = clamp(progress, 0, 1);
  const currentPositionLabel = position ?? "Live";

  return (
    <div className="rounded-[1.75rem] border border-foreground/10 bg-foreground/[0.025] p-5 text-left sm:p-6">
      <div className="space-y-1">
        <div className="text-foreground/38 text-xs uppercase tracking-[0.28em]">
          Queue journey
        </div>
        <h2 className="font-medium text-2xl tracking-tight">
          {aheadCount === 0
            ? "You are next in line."
            : `${aheadCount} ${
                aheadCount === 1 ? "person is" : "people are"
              } ahead of you.`}
        </h2>
      </div>

      <div
        className="queue-journey-shell mt-5"
        style={
          {
            "--marker-count": markerCount,
            "--queue-progress": normalizedProgress,
          } as CSSProperties
        }
      >
        <div className="mb-3 flex items-baseline justify-between">
          <div className="font-semibold text-sm tabular-nums tracking-tight">
            <span className="text-foreground/90">#{currentPositionLabel}</span>
            <span className="text-foreground/38"> in line</span>
          </div>
          <div className="text-foreground/50 text-sm tabular-nums">
            {formatWait(estimatedWaitSeconds)}
          </div>
        </div>

        <div aria-hidden="true" className="queue-journey-markers">
          {Array.from({ length: markerCount }).map((_, index) => {
            const markerProgress = index / (markerCount - 1);
            const isPassed = normalizedProgress >= markerProgress;

            return (
              <span
                className={`queue-journey-marker ${
                  isPassed ? "queue-journey-marker-passed" : ""
                }`}
                key={markerProgress}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
