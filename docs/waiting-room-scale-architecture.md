# Waiting Room Architecture Notes

Status: implemented design note
Last updated: 2026-04-06

## Why this doc exists

This document captures:

- the first waiting-room architecture we implemented
- why it was good enough as a demo but not good enough for extreme scale
- the refined design we implemented next
- the limits and tradeoffs of the refined version

It is meant to be useful in three ways:

1. As a source of truth for the refactor.
2. As a future internal design review artifact.
3. As raw material for a blog post about evolving a simple waiting room into a production-minded architecture.

Any pricing or quota assumptions in this document are time-sensitive and should be re-verified before publication.

Version 1 was preserved as the initial git baseline. The repository now reflects Version 2.

## The problem we are solving

We want a waiting room for a Next.js app hosted on Vercel that:

- protects a hot route during flash-sale or launch traffic
- remains fair enough for real users
- keeps normal admitted traffic fast
- avoids surprise costs during massive spikes
- scales to very large queue depths without Redis or Vercel becoming the bottleneck

The target is not just "works functionally." The target is "works at painful traffic levels without blowing up the bill."

## Version 1: the naive architecture we implemented first

The first version was intentionally straightforward:

- `src/proxy.ts` runs on every protected request.
- Anonymous users are redirected into the waiting-room flow.
- `/api/waiting-room/init` mints a stable identity cookie.
- `/waiting-room` renders the waiting-room page.
- The waiting-room client polls `/api/waiting-room/status` every 5 seconds.
- Redis stores active sessions, the FIFO queue, and recent session durations.
- A Lua script atomically decides whether a user is admitted or queued.

### Historical Version 1 references

Version 1 is preserved in git history as the initial baseline commit.

These are the major files that existed in that architecture:

- `src/proxy.ts`
- `src/lib/waiting-room/service.ts`
- `src/lib/waiting-room/providers/upstash.ts`
- `src/lib/waiting-room/providers/ioredis.ts`
- `src/lib/waiting-room/lua/try-admit.ts`
- `src/app/api/waiting-room/init/route.ts`
- `src/app/api/waiting-room/status/route.ts`
- `src/app/waiting-room/page.tsx`
- `src/app/waiting-room/queue-position-client.tsx`

### Why Version 1 was attractive

Version 1 has several qualities that make it a good first implementation:

- The control flow is easy to explain.
- Fairness is intuitive: queue order is join-time order.
- The proxy protects the route at the network boundary.
- Redis centralizes coordination.
- The queue UI can show position and estimated wait time.
- The code is clean enough to use as a demo or teaching example.

For a sample app or moderate traffic, this shape is completely reasonable.

## How Version 1 works

### Request flow

1. A user requests the protected route.
2. `proxy.ts` checks cookies and asks the shared service layer for a decision.
3. If the user is unknown, they are redirected to `/api/waiting-room/init`.
4. The init route creates or reuses a stable waiting-room identity.
5. The user lands on `/waiting-room`.
6. The waiting-room page checks whether the user is already admitted.
7. If not admitted, the browser polls `/api/waiting-room/status` every 5 seconds.
8. Each poll asks Redis whether the user can now be admitted.
9. Once admitted, the browser redirects back to the protected route.

### Redis data model in Version 1

- `active`: hash of `userId -> expiryMs`
- `queue`: sorted set of `joinTime -> userId`
- `durations`: list of recent session durations for ETA calculations

### Hot paths in Version 1

The most important thing we learned is that not all requests matter equally.

The actual hot paths are:

- proxy verification for admitted traffic
- queue polling for waiting traffic
- admission checks for users near the front of the queue

The waiting-room design has to optimize those paths first.

## Why Version 1 does not scale economically

The issue is not that the architecture is "wrong." The issue is that its cost curve gets ugly at launch scale.

### 1. Every admitted request still depends on queue state

In Version 1, `src/proxy.ts` calls the service layer on every protected request, and the service checks Redis for session validity. That means admitted traffic continues to pay coordination overhead even after a user is already let in.

That is acceptable for modest traffic, but at large scale it means:

- more function work than necessary
- more Redis reads than necessary
- more cross-network latency than necessary

The key learning: after a user is admitted, the common path should become mostly local and mostly stateless.

### 2. The queue polls too often

The waiting-room client polls every 5 seconds.

That sounds harmless until the queue gets large:

- 10,000 queued users -> about 2,000 poll requests per second
- 100,000 queued users -> about 20,000 poll requests per second
- 1,000,000 queued users -> about 200,000 poll requests per second

That is the real scale problem in Version 1.

The most expensive request in a waiting room is not the first request. It is the repeated status check multiplied by everyone still waiting.

### 3. The admission algorithm scans active sessions

The current Lua script loads the entire active-session hash using `HGETALL` before deciding whether someone can enter.

That means the cost of a single admission attempt grows with the number of active sessions. This is the exact opposite of what we want in a launch system.

At high concurrency, the algorithm needs to be:

- constant-time, or very close to it
- bounded in memory and CPU
- independent of total active population size

Version 1 is not that.

### 4. Some demo-only reads are not production-safe

The demo page asks Redis for an active user count by loading the full active hash and removing expired entries.

That is acceptable for a sample app.

It is not acceptable as a production pattern for:

- a protected route
- a launch page
- any high-frequency request path

### 5. Edge Config reads can become a real bill line on hot paths

Version 1 uses runtime config resolution that can consult Edge Config.

Edge Config is great for:

- capacity knobs
- fail-open or fail-closed switches
- operational tuning without redeploys

Edge Config is not something we want to read as part of every hot queue interaction if we can avoid it.

The learning here is simple: dynamic configuration is valuable, but it should not become part of the highest-frequency request path unless we truly need it there.

### 6. Precision can cost more than it is worth

Version 1 tries to provide:

- exact queue position
- rolling ETA
- immediate readiness checks

Those are nice product features, but they are not free.

In a very large launch, we should prefer:

- approximate position bands
- coarse ETA ranges
- less frequent checks when the user is far from the front

The most scalable queue is not the one with the prettiest precision. It is the one that avoids unnecessary work.

## Illustrative cost shape of Version 1

These figures are directional only and based on the pricing and docs we reviewed on 2026-04-06. They are useful for architecture comparison, not as a billing guarantee.

### Example scenario

- 1,000,000 queued users
- 5 minute average wait
- 5 second polling interval
- costs shown as rough usage-based estimates only

### Rough request math

- Polls per user: about 60
- Total queue-related requests per user: about 64
- Total Vercel requests: about 64,000,000
- Rough Redis commands: about 185,000,000
- Peak poll rate: about 200,000 requests per second

### Rough usage-based cost shape

| Cost area | Rough estimate |
| :--- | :--- |
| Vercel edge requests | about $128 |
| Vercel function invocations | about $38 |
| Upstash commands | about $370 |
| Edge Config reads if every dynamic request reads config | about $192 |

These numbers exclude several things:

- CPU overages
- memory duration effects
- transfer costs
- bot traffic
- origin traffic created by the protected application itself

The important conclusion is not the exact dollar amount.

The important conclusion is that Version 1 turns "lots of people waiting" into "lots of repeated compute and Redis work."

## The biggest learning

The proxy is not the main problem.

The main problem is this combination:

- admitted traffic still consulting Redis
- queued users polling frequently
- each admission attempt doing too much work

Said differently:

The expensive part of a waiting room is not checking the front door once. It is letting the whole crowd knock every few seconds.

## Version 2: the refined architecture we implemented

The refined design keeps the good parts of Version 1 while changing the cost model.

### Core design goals for Version 2

- admitted traffic should be locally verifiable
- queue state transitions should be centralized and cheap
- queue checks should be adaptive rather than constant
- Redis operations should avoid full scans
- the waiting-room page should be mostly static
- operational controls should remain easy to change

## Version 2 architecture

### Current implementation references

These files now represent the Version 2 implementation:

- `src/proxy.ts`
- `src/lib/waiting-room/admission-token.ts`
- `src/lib/waiting-room/service.ts`
- `src/lib/waiting-room/lua/try-admit.ts`
- `src/lib/waiting-room/providers/upstash.ts`
- `src/lib/waiting-room/providers/ioredis.ts`
- `src/app/api/waiting-room/init/route.ts`
- `src/app/api/waiting-room/status/route.ts`
- `src/app/waiting-room/page.tsx`
- `src/app/waiting-room/queue-position-client.tsx`

### 1. Signed admission token for the hot path

Once a user is admitted, we mint a signed admission token and store it in a cookie.

`proxy.ts` should then:

- verify the token locally
- trust the token until expiry
- avoid Redis for the common admitted path

This turns admitted traffic into a mostly stateless check.

That is the single most important cost improvement.

### 2. Redis only for queue transitions

Redis should be used for the parts of the workflow that actually require shared coordination:

- join queue
- determine whether a user has reached the admission frontier
- claim admission
- refresh queue identity if needed

Redis should not be involved in every protected request once admission is granted.

### 3. Replace active-session scans with bounded structures

We want to remove any algorithm that requires loading the full active session set on each attempt.

The refined design should use bounded data structures such as:

- a sorted set keyed by session expiry
- a monotonic ticket system for queue order
- compact counters or frontier markers

The key property is that admission checks should not degrade as active population grows.

### 4. Ticket plus frontier instead of "everyone retries admission"

The refined queue model should look more like this:

- each entrant receives a monotonic ticket number
- the system tracks the admission frontier
- a user is eligible when their ticket is at or before the frontier

That allows us to answer queue status more cheaply and more predictably.

It also removes the need for every waiting user to compete for admission logic on every poll.

### 5. Static waiting-room shell

The waiting-room page should be a mostly static shell that:

- reads the queue identity from cookies
- renders immediately
- lets the client fetch status separately

We should avoid doing expensive admission work during page render when the same information is going to be rechecked by the client anyway.

### 6. Adaptive polling with jitter

Instead of polling every 5 seconds forever, the client should poll based on how close the user is to admission.

Example policy:

- far from the front: every 30 to 60 seconds
- middle of the queue: every 10 to 15 seconds
- near the front: every 3 to 5 seconds
- always add jitter so clients do not synchronize

This dramatically reduces request volume while preserving responsiveness where it matters.

### 7. Coarse wait-time estimation

We do not need perfect ETA to provide a good waiting-room experience.

A better production tradeoff is:

- coarse ETA bands
- approximate position
- a stable message that updates occasionally

That improves scale and lowers Redis load.

### 8. Edge Config only for low-frequency controls

We still want dynamic operations knobs, especially:

- capacity
- maintenance mode
- fail-open or fail-closed mode
- maybe queue pace tuning

But we should keep Edge Config out of the hottest request paths as much as possible.

The refined rule is:

- use Edge Config for operator controls
- use local or cached config for per-request fast paths where possible

### 9. Protect the queue from bots before the app pays for them

A launch queue is part traffic-control system and part abuse-control system.

The refined architecture should assume:

- bots will hit the waiting room
- scrapers will retry aggressively
- users will refresh repeatedly

So platform protections matter:

- WAF
- bot management
- rate limiting
- caching of static waiting-room assets

App code should not be the first line of defense if we can help it.

## Version 2 request flow

1. User requests the protected route.
2. `proxy.ts` checks for a signed admission token.
3. If the token is valid, the request proceeds without Redis.
4. If no token is present, the user is redirected into the queue join flow.
5. The join route allocates a queue ticket and writes queue identity cookies.
6. The waiting-room page renders a lightweight shell.
7. The browser polls status adaptively, with jitter.
8. The status endpoint checks a cheap eligibility condition.
9. When the user becomes eligible, the server mints a signed admission token.
10. The browser is redirected back to the protected route.

## Why Version 2 is better

Version 2 reduces cost in the places that actually matter:

- admitted traffic no longer needs Redis
- waiting users poll less often
- admission checks stop scanning full active state
- the queue becomes cheaper as a system, not just faster as a function

Just as importantly, Version 2 makes the architecture easier to reason about:

- queue state stays authoritative in one place
- the hot path becomes mostly local token verification
- the expensive work is pushed to rarer state transitions

## What we should be honest about in a future blog post

The refined version is better, but it is not magic.

### Limitation 1: it still uses polling

Even with adaptive polling, this is still a polling system.

That means:

- there is still ongoing request volume while users wait
- status updates are not perfectly real-time
- we are trading lower cost for a small amount of staleness

This is the right tradeoff for scale, but it is still a tradeoff.

### Limitation 2: position and ETA become less exact

If we optimize for cost, we should not promise exact precision that requires expensive coordination.

The refined version should prefer:

- rough position
- position bands
- approximate wait ranges

That is usually enough for users, but it is less precise than a tightly coordinated queue UI.

### Limitation 3: strict global fairness is hard

At global scale, perfect FIFO fairness is expensive and operationally fragile.

Even a well-designed system still has real-world complications:

- retries
- client disconnects
- clock drift
- multiple regions
- expired sessions
- reconnect behavior

The refined architecture should be fair enough and predictable, not mathematically perfect.

### Limitation 4: token revocation is not free

A signed admission token removes Redis from the hot path, which is great.

But the tradeoff is that revoking admission immediately becomes harder unless we add:

- token versioning
- a revocation list
- short TTLs with refresh

That is a normal tradeoff in stateless systems, but it needs to be acknowledged.

### Limitation 5: one primary queue authority still matters

If we want consistent admission decisions, writes should typically go through one primary authority region.

That improves correctness, but it also means:

- queue coordination is not infinitely parallel
- region placement matters
- cross-region writes can still add latency

For truly gigantic launches, the queue itself may need a dedicated regional strategy.

### Limitation 6: the waiting room does not fix the protected app

A waiting room protects the blast radius of the launch.

It does not automatically make the downstream app scalable.

We still need the protected experience to handle:

- sudden admission bursts
- expensive API calls
- inventory checks
- checkout or purchase pressure

If the protected route cannot scale, the waiting room only delays the failure.

### Limitation 7: extreme bot traffic can still dominate economics

If we allow hostile or low-value traffic to enter the app-layer queue, we will still pay for it.

The refined waiting room should be paired with platform-level protections.

Otherwise we are just building an efficient queue for attackers too.

### Limitation 8: billions of arrivals may require a bigger front door

There is a threshold where an application-level waiting room is not enough on its own.

At very large scale, we may need:

- stronger platform traffic controls
- pre-queue challenge flows
- upstream CDN or edge enforcement
- launch-specific infrastructure strategy

The refined version is dramatically better than Version 1, but it is still an application-centric waiting room.

## Implementation principles for the refactor

As we implement Version 2, we should preserve these rules:

- no full scans on hot paths
- no Redis reads for the common admitted path
- no exactness requirement that forces expensive coordination
- no fixed high-frequency polling for all waiting users
- no demo-only observability code in production paths
- no operator controls that accidentally become per-request costs

## Potential blog framing

If we turn this into a post later, the most interesting story is not "how to build a waiting room."

The real story is:

- why the first implementation looked correct
- what changed when we looked at cost and scale honestly
- how the real bottleneck was queue churn, not just the proxy
- why local token verification is the unlock
- how we balanced fairness, cost, and user experience

## Short summary

Version 1 was a good functional waiting room.

Version 2 is about making the economics sane:

- local verification for admitted traffic
- cheap shared coordination for queue transitions
- adaptive polling
- bounded Redis operations
- honest tradeoffs about precision and fairness

That is the path from "nice demo" to "launch architecture."
