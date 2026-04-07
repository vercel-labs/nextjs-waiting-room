"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PROTECTED_DEMO_PATH,
  WAITING_ROOM_INIT_PATH,
} from "@/lib/waiting-room/cookies";
import {
  DEFAULT_DEMO_PEOPLE_AHEAD,
  DEFAULT_DEMO_SLOT_INTERVAL_SECONDS,
  estimateDemoWaitSeconds,
  formatEstimatedWait,
  MAX_DEMO_PEOPLE_AHEAD,
  MAX_DEMO_SLOT_INTERVAL_SECONDS,
  MIN_DEMO_SLOT_INTERVAL_SECONDS,
} from "@/lib/waiting-room/demo-simulation";

interface DemoTrafficControlsProps {
  nextPath: string;
}

const PRESETS = [
  {
    label: "Instant",
    peopleAhead: 0,
    slotIntervalSeconds: 5,
  },
  {
    label: "Light",
    peopleAhead: 5,
    slotIntervalSeconds: 5,
  },
  {
    label: "Busy",
    peopleAhead: 25,
    slotIntervalSeconds: 3,
  },
  {
    label: "Launch day",
    peopleAhead: 100,
    slotIntervalSeconds: 1,
  },
];

export function DemoTrafficControls({ nextPath }: DemoTrafficControlsProps) {
  const [peopleAhead, setPeopleAhead] = useState(DEFAULT_DEMO_PEOPLE_AHEAD);
  const [slotIntervalSeconds, setSlotIntervalSeconds] = useState(
    DEFAULT_DEMO_SLOT_INTERVAL_SECONDS
  );

  const estimatedWaitSeconds = estimateDemoWaitSeconds({
    peopleAhead,
    slotIntervalSeconds,
  });
  const ctaLabel =
    peopleAhead === 0 ? "Enter Demo Now" : "Join Simulated Queue";

  return (
    <div className="w-full rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 text-left">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const active =
            preset.peopleAhead === peopleAhead &&
            preset.slotIntervalSeconds === slotIntervalSeconds;

          return (
            <button
              className={`rounded-full border px-3 py-1 font-mono text-xs transition ${
                active
                  ? "border-foreground/22 bg-foreground text-background"
                  : "border-foreground/10 text-foreground/60 hover:border-foreground/22 hover:text-foreground"
              }`}
              key={preset.label}
              onClick={() => {
                setPeopleAhead(preset.peopleAhead);
                setSlotIntervalSeconds(preset.slotIntervalSeconds);
              }}
              type="button"
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-3">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="font-mono text-foreground/38 text-xs uppercase tracking-[0.2em]">
              People ahead
            </span>
            <span className="font-mono text-sm tabular-nums">
              {peopleAhead}
            </span>
          </div>
          <input
            className="mt-1.5 w-full accent-white"
            max={MAX_DEMO_PEOPLE_AHEAD}
            min={0}
            onChange={(event) => {
              setPeopleAhead(Number(event.target.value));
            }}
            type="range"
            value={peopleAhead}
          />
        </label>

        <label className="block">
          <div className="flex items-center justify-between">
            <span className="font-mono text-foreground/38 text-xs uppercase tracking-[0.2em]">
              Seconds per slot
            </span>
            <span className="font-mono text-sm tabular-nums">
              {slotIntervalSeconds}s
            </span>
          </div>
          <input
            className="mt-1.5 w-full accent-white"
            max={MAX_DEMO_SLOT_INTERVAL_SECONDS}
            min={MIN_DEMO_SLOT_INTERVAL_SECONDS}
            onChange={(event) => {
              setSlotIntervalSeconds(Number(event.target.value));
            }}
            type="range"
            value={slotIntervalSeconds}
          />
        </label>
      </div>

      <div className="mt-3 font-mono text-foreground/50 text-xs tabular-nums">
        Est. {formatEstimatedWait(estimatedWaitSeconds)}
      </div>

      <form action={WAITING_ROOM_INIT_PATH} className="mt-3" method="GET">
        <input name="next" type="hidden" value={nextPath} />
        <input name="ahead" type="hidden" value={peopleAhead} />
        <input name="pace" type="hidden" value={slotIntervalSeconds} />
        <button
          className="w-full rounded-full bg-foreground px-6 py-2.5 font-medium font-mono text-background text-sm transition hover:opacity-90"
          type="submit"
        >
          {ctaLabel}
        </button>
      </form>

      <div className="mt-2 text-center">
        <Link
          className="font-mono text-foreground/40 text-xs transition hover:text-foreground"
          href={PROTECTED_DEMO_PATH}
        >
          or visit {PROTECTED_DEMO_PATH} directly
        </Link>
      </div>
    </div>
  );
}
