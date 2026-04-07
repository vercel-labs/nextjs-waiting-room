"use client";

import { ModeTabs } from "./mode-tabs";

const TABS = [
  {
    description:
      "On a laptop by yourself, there usually is no real contention, so the waiting room can admit you immediately. The traffic controls on this page simulate realistic people ahead of your browser so you can still show queue positions, countdowns, and the automatic redirect.",
    eyebrow: "Single browser or single presenter",
    id: "local",
    label: "Local demo",
    points: [
      "Set people ahead to 0 to show the fast path.",
      "Increase queue depth to stage traffic ahead of your browser.",
      "The waiting room still uses the normal join, poll, and admit flow.",
    ],
    title: "Instant admit is expected when there is no traffic ahead of you.",
  },
  {
    description:
      "In a deployed environment, actual users share the provider-backed capacity and queue. Positions, active sessions, and wait estimates come from live contention instead of the browser-scoped simulator, but the admission path is the same.",
    eyebrow: "Multiple browsers hitting the same route",
    id: "deployed",
    label: "Shared deployment",
    points: [
      "Real visitors compete for shared capacity.",
      "Queue order and admission state are backed by the provider.",
      "Admitted users skip the line until their session expires.",
    ],
    title:
      "The same logic governs real traffic when multiple visitors arrive together.",
  },
] as const;

export function DemoModeTabs() {
  return (
    <div className="rounded-[1.75rem] border border-foreground/10 bg-foreground/[0.025] p-4">
      <ModeTabs ariaLabel="Demo environment" defaultValue="local">
        {TABS.map((tab) => (
          <ModeTabs.Panel key={tab.id} label={tab.label} value={tab.id}>
            <div className="space-y-3">
              <div>
                <div className="text-foreground/38 text-xs uppercase tracking-[0.24em]">
                  {tab.eyebrow}
                </div>
                <h2 className="mt-2 max-w-lg font-medium text-lg tracking-tight">
                  {tab.title}
                </h2>
                <p className="mt-2 max-w-lg text-foreground/62 text-sm leading-6">
                  {tab.description}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {tab.points.map((point) => (
                  <div
                    className="rounded-2xl border border-foreground/8 bg-background/20 px-4 py-3 text-foreground/64 text-sm leading-6"
                    key={point}
                  >
                    {point}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-foreground/8 bg-background/25 px-4 py-3">
                <div className="text-foreground/38 text-xs uppercase tracking-[0.24em]">
                  Same core logic
                </div>
                <p className="mt-2 text-foreground/64 text-sm leading-6">
                  Start queue flow, enter waiting room, check status, admit when
                  capacity opens, then redirect into the protected route. Only
                  the traffic source changes.
                </p>
              </div>
            </div>
          </ModeTabs.Panel>
        ))}
      </ModeTabs>
    </div>
  );
}
