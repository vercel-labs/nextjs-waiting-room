import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DEFAULT_AFTER_WAITING_ROOM_PATH,
  getSafeRedirectPath,
} from "@/lib/waiting-room/cookies";
import {
  formatEstimatedWait,
  parseDemoSimulationState,
} from "@/lib/waiting-room/demo-simulation";
import { resolveWaitingRoomPageState } from "@/lib/waiting-room/service";
import {
  COOKIE_NAME_DEMO_SIMULATION,
  COOKIE_NAME_ID,
} from "@/lib/waiting-room/types";
import { QueuePositionClient } from "./queue-position-client";

interface WaitingRoomPageProps {
  searchParams: Promise<{ next?: string | string[] | undefined }>;
}

export default async function WaitingRoomPage({
  searchParams,
}: WaitingRoomPageProps) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE_NAME_ID)?.value;
  const simulation = parseDemoSimulationState(
    cookieStore.get(COOKIE_NAME_DEMO_SIMULATION)?.value
  );
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = getSafeRedirectPath(
    nextValue,
    DEFAULT_AFTER_WAITING_ROOM_PATH
  );
  const state = await resolveWaitingRoomPageState(
    userId ?? null,
    nextPath,
    simulation
  );

  if (state.status === "redirect") {
    redirect(state.destination);
  }

  if (state.status === "unavailable") {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-foreground/10 border-b">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
            <Link
              className="font-mono text-foreground/45 text-xs uppercase tracking-[0.2em] transition hover:text-foreground"
              href="/"
            >
              Next.js Waiting Room
            </Link>
            <Link
              className="font-mono text-foreground/50 text-xs transition hover:text-foreground"
              href="/"
            >
              Overview
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-8 text-center">
            <div className="space-y-3">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                <svg
                  aria-label="Warning"
                  className="h-8 w-8 text-amber-500"
                  fill="none"
                  role="img"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Warning</title>
                  <path
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.72 3h16.92a2 2 0 001.72-3L13.71 3.86a2 2 0 00-3.42 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h1 className="font-semibold text-3xl tracking-tight">
                Waiting room unavailable
              </h1>
              <p className="text-foreground/60 text-lg">
                We can&apos;t confirm admission right now. Please try again in a
                moment.
              </p>
            </div>

            <p className="text-foreground/40 text-sm">
              This demo is running in fail-closed mode, so we&apos;re pausing
              admission until the backing provider recovers.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-foreground/10 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <Link
            className="font-mono text-foreground/45 text-xs uppercase tracking-[0.2em] transition hover:text-foreground"
            href="/"
          >
            Next.js Waiting Room
          </Link>
          <Link
            className="font-mono text-foreground/50 text-xs transition hover:text-foreground"
            href="/"
          >
            Overview
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="w-full max-w-xl space-y-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            Waiting room
          </h1>

          {state.queue.demo ? (
            <div className="font-mono text-foreground/40 text-xs tabular-nums">
              Simulation: {state.queue.demo.peopleAhead}
              {" ahead · 1 slot every "}
              {state.queue.demo.slotIntervalSeconds}
              {"s · "}
              {formatEstimatedWait(state.queue.estimatedWait)}
              {" wait · "}
              <Link
                className="text-foreground/50 transition hover:text-foreground"
                href="/"
              >
                Change
              </Link>
            </div>
          ) : null}

          <QueuePositionClient
            initialStatus={state.queue}
            nextPath={nextPath}
          />
        </div>
      </main>

      <footer className="border-foreground/10 border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-3 text-center text-foreground/35 text-xs">
          You&apos;ll be redirected automatically when a spot opens.
        </div>
      </footer>
    </div>
  );
}
