import Link from "next/link";
import { PROTECTED_DEMO_PATH } from "@/lib/waiting-room/cookies";
import { DemoTrafficControls } from "./demo-traffic-controls";
import { LiveModePanel } from "./live-mode-panel";
import { ModeTabs } from "./mode-tabs";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-foreground/10 border-b">
        <div className="mx-auto flex w-full max-w-5xl px-6 py-5">
          <Link
            className="font-mono text-foreground/45 text-xs uppercase tracking-[0.2em] transition hover:text-foreground"
            href="/"
          >
            Next.js Waiting Room
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 py-16">
        <div className="w-full space-y-5 text-center">
          <div className="space-y-1">
            <h1 className="font-mono font-semibold text-2xl">Waiting Room</h1>
            <p className="font-mono text-foreground/40 text-xs">
              Simulate queue traffic, then watch it clear in real time
            </p>
          </div>

          <ModeTabs ariaLabel="Waiting room demo mode" defaultValue="live">
            <ModeTabs.Panel label="Live" value="live">
              <LiveModePanel nextPath={PROTECTED_DEMO_PATH} />
            </ModeTabs.Panel>
            <ModeTabs.Panel label="Solo" value="solo">
              <DemoTrafficControls nextPath={PROTECTED_DEMO_PATH} />
            </ModeTabs.Panel>
          </ModeTabs>
        </div>
      </main>

      <footer className="border-foreground/10 border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-3 text-center font-mono text-foreground/35 text-xs">
          Protected route at{" "}
          <Link
            className="text-foreground/50 hover:text-foreground"
            href={PROTECTED_DEMO_PATH}
          >
            {PROTECTED_DEMO_PATH}
          </Link>
        </div>
      </footer>
    </div>
  );
}
