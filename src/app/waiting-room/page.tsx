import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DEFAULT_AFTER_WAITING_ROOM_PATH,
  getSafeRedirectPath,
  getWaitingRoomInitPath,
} from "@/lib/waiting-room/cookies";
import {
  formatEstimatedWait,
  parseDemoSimulationState,
  resolveDemoQueuedStatus,
} from "@/lib/waiting-room/demo-simulation";
import { resolveWaitingRoomPageState } from "@/lib/waiting-room/service";
import {
  COOKIE_NAME_ADMISSION,
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
  const admissionToken = cookieStore.get(COOKIE_NAME_ADMISSION)?.value;
  const simulation = parseDemoSimulationState(
    cookieStore.get(COOKIE_NAME_DEMO_SIMULATION)?.value
  );
  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = getSafeRedirectPath(
    nextValue,
    DEFAULT_AFTER_WAITING_ROOM_PATH
  );
  if (!userId) {
    redirect(getWaitingRoomInitPath(nextPath));
  }

  const state = resolveWaitingRoomPageState(admissionToken, nextPath);
  const simulatedQueue = resolveDemoQueuedStatus(simulation);

  if (state.status === "redirect") {
    redirect(state.destination);
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

          {simulatedQueue?.demo ? (
            <div className="font-mono text-foreground/40 text-xs tabular-nums">
              Simulation: {simulatedQueue.demo.peopleAhead}
              {" ahead · 1 slot every "}
              {simulatedQueue.demo.slotIntervalSeconds}
              {"s · "}
              {formatEstimatedWait(simulatedQueue.estimatedWait)}
              {" wait · "}
              <Link
                className="text-foreground/50 transition hover:text-foreground"
                href="/"
              >
                Change
              </Link>
            </div>
          ) : null}

          <QueuePositionClient nextPath={nextPath} />
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
