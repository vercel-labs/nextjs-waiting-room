import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DEFAULT_AFTER_WAITING_ROOM_PATH } from "@/lib/waiting-room/cookies";
import { resolveProtectedPageState } from "@/lib/waiting-room/service";
import { COOKIE_NAME_ID } from "@/lib/waiting-room/types";
import { PurchaseButton } from "../purchase-button";
import { SessionFooter } from "../session-footer";

export default async function ProtectedDemoPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE_NAME_ID)?.value;
  const state = await resolveProtectedPageState(
    userId ?? null,
    DEFAULT_AFTER_WAITING_ROOM_PATH
  );

  if (state.status === "redirect") {
    redirect(state.destination);
  }

  if (state.status === "degraded") {
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
          <div className="space-y-3">
            <h1 className="font-mono font-semibold text-2xl tracking-tight">
              Demo (degraded)
            </h1>
            <p className="font-mono text-foreground/50 text-sm">
              Waiting room unavailable. Traffic is still admitted.
            </p>
          </div>
        </main>

        {state.userId ? (
          <SessionFooter activeCount={0} sessionId={state.userId} />
        ) : null}
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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-[420px]">
          <div className="overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-foreground/[0.025]">
            <div className="flex items-center gap-2 px-6 pt-5 pb-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="font-mono text-foreground/45 text-xs uppercase tracking-[0.28em]">
                Queue cleared · You&rsquo;re in
              </span>
            </div>

            <div className="relative mx-6 mt-5 flex aspect-[4/3] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
              <div
                className="absolute inset-0 opacity-[0.15]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, currentColor 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent to-foreground/[0.06]" />
              <span
                aria-label="sneaker"
                className="relative select-none text-5xl"
                role="img"
              >
                👟
              </span>
              <span className="relative font-mono text-foreground/25 text-xs uppercase tracking-[0.32em]">
                SNKR-001
              </span>
            </div>

            <div className="space-y-5 px-6 pt-5 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-mono text-foreground/38 text-xs uppercase tracking-[0.28em]">
                    Limited Release
                  </div>
                  <h1 className="font-mono font-semibold text-foreground text-xl leading-tight tracking-tight">
                    AIR PHANTOM V
                  </h1>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono font-semibold text-2xl text-foreground tabular-nums tracking-tight">
                    $249
                  </div>
                  <div className="mt-0.5 font-mono text-foreground/38 text-xs">
                    USD
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 font-mono text-foreground/45 text-xs tracking-wide">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Size: 10</span>
                  <span className="text-foreground/20">·</span>
                  <span>Colorway: Shadow</span>
                  <span className="text-foreground/20">·</span>
                  <span>Limited: 1/500</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>SKU: AP5-SHD-10</span>
                  <span className="text-foreground/20">·</span>
                  <span>Ships in 3–5 days</span>
                </div>
              </div>

              <div className="border-foreground/8 border-t" />

              <PurchaseButton />
            </div>
          </div>
        </div>
      </main>

      <SessionFooter activeCount={state.activeCount} sessionId={state.userId} />
    </div>
  );
}
