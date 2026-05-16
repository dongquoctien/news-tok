# TTS Resilience + Circuit Breaker — Plan

**Status**: Planned, not started
**Drafted**: 2026-05-16
**Estimated effort**: 1.5–4 days depending on scope
**Trigger to start**: Edge TTS shows signs of instability OR a user reports a
provider outage they couldn't work around.

---

## Why this exists

Two related risks live in the current codebase. Both are about external
service dependencies failing in ways that block the user from finishing a
project.

### Risk A — Edge TTS single point of failure

Every video this app produces goes through `msedge-tts` (Microsoft's free
Edge browser TTS endpoint). Two things can happen:

1. **Microsoft changes the API.** They've done it twice in 2023–2024.
   Each time the `msedge-tts` library needed a patch release and there
   was a window where the pipeline was dead.
2. **IP / rate-limit block.** No published quota. Heavy local traffic
   eventually trips a soft block.

When either fires today, the entire TTS step throws. The user can't
generate voice for any segment, which means they can't render at all.

### Risk B — Image providers fail noisily

`searchImage` walks Pexels → Unsplash → Pixabay → Openverse → Wikimedia
on each call. Two known issues:

1. **Pixabay is blocked by Cloudflare for Node clients.** Every call to
   it costs 3–5s of timeout. Code still tries it every time.
2. **Transient outages.** A provider being down for 5 minutes makes
   every `searchImage` call slow because nothing remembers the recent
   failure. Each call re-discovers the outage.

Neither risk is currently *blocking* the app — Edge TTS has been stable
2 years running, and `searchImage` has 4 working fallbacks for Pixabay.
That's why this plan is filed as "planned" not "in flight."

---

## Solution overview

Two independent pieces. Either can ship without the other.

| Piece | What it adds | Effort |
|---|---|---|
| **TTS resilience** | Provider interface + Piper fallback + doctor health check | 1.5–3 days |
| **Circuit breaker** | Per-provider failure tracking + auto-skip | 4 hours |

---

## Piece 1 — TTS resilience

Three layers, each independently mergeable. You can ship just layers
1 + 3 (the cheap defensive ones) and add layer 2 later when you
actually want the offline fallback.

### Layer 1 — Provider abstraction (4 hours)

Refactor `synthesizeVoice` into an interface so the implementation can
swap without touching call sites.

**Files to change:**
- `packages/media/src/tts/types.ts` (new) — `TtsProvider` interface
- `packages/media/src/tts/edge.ts` (move from `edge-tts.ts`) — implements `TtsProvider`
- `packages/media/src/tts/index.ts` (new) — registry + active provider lookup
- `packages/media/src/index.ts` — re-export with the same `synthesize` name so MCP server doesn't break

**Interface shape:**

```ts
export interface TtsProvider {
  readonly id: 'edge' | 'piper' | string
  synthesize(opts: SynthesizeOptions): Promise<SynthesizeResult>
  listVoices(language: Language): Promise<VoiceInfo[]>
  /** Cheap ping — used by /pnpm doctor and the circuit breaker. */
  isHealthy(): Promise<boolean>
}
```

Why this matters even without layer 2: it surfaces the *shape* of the
fallback contract so the day you need to add one, the work is purely
additive.

**Acceptance:**
- All existing MCP TTS calls keep working with no observable change
- `pnpm check` clean, no schema or test changes needed
- Provider id surfaces in `AssetRef.source.provider` (which already
  accepts `'edge-tts'` — verify Piper id is added to the zod enum)

### Layer 2 — Piper local fallback (1.5–2 days)

Add a second TTS provider that runs entirely offline. Falls back to
Piper when Edge fails 2 times in a row.

**Why Piper specifically:**
- Open-source, MIT licensed
- Vietnamese voice exists: `vi_VN-vais1000-medium` (~50MB)
- English voice: `en_US-amy-medium`
- CPU-only inference, ~real-time on modern hardware
- One binary per platform, no Python dependency

**Files to change:**
- `packages/media/src/tts/piper.ts` (new) — implements `TtsProvider`
- `packages/media/src/tts/registry.ts` — wire failover (Edge fail → Piper try)
- `scripts/install-piper.mjs` (new) — first-run model download into `data/cache/tts-models/`
- `scripts/doctor.mjs` — verify piper binary + models present
- `packages/shared/src/schema.ts` — add `'piper'` to `AssetRefSchema.source.provider` enum
- `packages/shared/src/schema.test.ts` — round-trip with the new provider value

**Word boundary problem:** Piper does NOT emit word boundaries out of
the box. The renderer needs `wordBoundaries` for karaoke + ducking. Two
options:

- **(a) Estimate from audio length.** Split `text` into words, distribute
  evenly across `audioDurationSec`. Coarse but always works.
- **(b) Use `aeneas` or `whisperX` for forced alignment.** Accurate but
  adds a heavy dep (Python or Whisper model).

Pick **(a)** for layer 2. It's "good enough" for the fallback case —
the user already knows they're on backup voice.

**Storyboard schema change:** when fallback fires, write
`segment.audio.narration.source.provider = 'piper'` so Studio's UI can
surface a "rendered with backup voice" hint.

**Acceptance:**
- Mock Edge TTS to throw 2× consecutive errors → Piper takes over
- `synthesizeVoice` returns valid `wordBoundaries` (even if coarse)
- Render with Piper-generated narration produces a clean mp4
- `pnpm doctor` warns if Piper models missing
- Existing tests + a new vitest for the registry failover logic

#### Alternative considered: Valtec Vietnamese TTS

`valtec-tts` (github.com/tronghieuit/valtec-tts) was evaluated as a
Piper replacement. Native Vietnamese model, 5 built-in voices, plus
zero-shot voice cloning from 3-10s reference audio. Better VI quality
than Piper.

**Why we don't recommend it as the primary fallback:**

| Factor | Verdict |
|---|---|
| Runtime stack | Python 3.8+ + PyTorch 2.5 + 16 deps (~2GB install) vs Piper's single binary. Breaks the "100% Node local app" promise. |
| HTTP surface | Only ships a Python lib + Gradio demo UI. No stable REST API — we'd need to wrap it in FastAPI ourselves and maintain a second service. |
| Word boundaries | Not exposed. VITS-based, so phoneme-level alignment exists internally but would need a source fork + phoneme → word grouping to use. Breaks karaoke / ducking on fallback. |
| Disk footprint | 285MB model + 1-2GB Python deps vs Piper's ~50MB/voice. |
| EN support | None. Project supports `vi` + `en`; fallback must cover both. |

**Two cases where Valtec still makes sense (not as Edge fallback):**

1. **Opt-in premium offline provider.** User who wants the best VI
   quality and accepts the Python setup runs Valtec in Docker
   (`docker run -p 7860:7860 valtec-tts`). `news-tok` probes
   `localhost:7860` on startup; if up, registers it as a third
   provider behind Edge → Piper. Default off, manual install.

2. **Standalone voice-cloning feature.** Zero-shot voice cloning is
   unique to Valtec — neither Edge nor Piper has it. That's a
   feature add ("clone my own voice for narration"), not a
   resilience layer. Worth a separate plan if/when there's demand.

**If you want Valtec as a Case-1 provider after Piper is in place**,
filing a separate `docs/planned/valtec-provider-plan.md` is the right
move — it's additive, not a replacement.

### Layer 3 — Doctor health check (1 hour)

Add Edge TTS endpoint ping to `scripts/doctor.mjs`. Currently doctor
checks ffmpeg + env vars + MCP wiring. Add ~10 lines:

```js
const edgeOk = await tryFetch('https://speech.platform.bing.com/...', { timeout: 3000 })
if (edgeOk) ok('Edge TTS reachable')
else warn('Edge TTS unreachable — synthesizeVoice will fail or fall back to Piper if installed')
```

Why so cheap: doctor is the one place a user runs to find out why
nothing works. The hint is high signal.

---

## Piece 2 — Circuit breaker for image providers

Stop wasting timeouts on providers that are down.

### Pattern

```
[CLOSED] ── 3 consecutive failures ──→ [OPEN] ── 10 minute cooldown ──→ [HALF-OPEN]
   ↑                                                                          │
   └──── 1 success ◄── try one request ◄──────────────────────────────────────┘
```

- **CLOSED** (default): every request flows through normally
- **OPEN**: provider is skipped entirely — fallback chain advances
  immediately, no timeout cost
- **HALF-OPEN**: after cooldown, send one probe. Success → CLOSED.
  Failure → OPEN with cooldown doubled (max 1 hour cap)

State is in-memory only. Server restart resets the breaker — fine, the
defaults are conservative enough that a stale OPEN state across
restarts wouldn't matter much.

### Implementation

**Files to change:**
- `packages/media/src/circuit-breaker.ts` (new) — ~50 lines, generic
- `packages/media/src/pexels.ts` — wrap `searchImage` body with breaker
- `packages/media/src/unsplash.ts` — same
- `packages/media/src/pixabay.ts` — same + **default `disabled: true`**
  in code, only enable when caller explicitly passes `provider: 'pixabay'`
- `packages/media/src/openverse.ts` — same wrap
- `packages/media/src/wikimedia.ts` — same wrap
- `packages/media/src/circuit-breaker.test.ts` (new) — vitest covers
  state transitions

**Code sketch:**

```ts
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private consecutiveFailures = 0
  private openedAt = 0
  private cooldownMs = 10 * 60 * 1000 // doubles on each re-open

  async call<T>(providerLabel: string, fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) {
        throw new ProviderUnavailableError(
          `${providerLabel} circuit open — retry in ${remaining}s`
        )
      }
      this.state = 'half-open'
    }
    try {
      const result = await fn()
      if (this.state !== 'closed') {
        logger.info(`${providerLabel} circuit recovered — back to CLOSED`)
      }
      this.consecutiveFailures = 0
      this.cooldownMs = 10 * 60 * 1000
      this.state = 'closed'
      return result
    } catch (err) {
      this.consecutiveFailures++
      if (this.consecutiveFailures >= 3) {
        this.state = 'open'
        this.openedAt = Date.now()
        this.cooldownMs = Math.min(60 * 60 * 1000, this.cooldownMs * 2)
        logger.warn(
          `${providerLabel} circuit OPENED after 3 failures — cooldown ${this.cooldownMs/1000}s`
        )
      }
      throw err
    }
  }
}
```

**Caller convention:**

```ts
// inside packages/media/src/pexels.ts
const breaker = new CircuitBreaker()
export async function searchImage(query: string) {
  return breaker.call('pexels', async () => {
    // existing search logic untouched
  })
}
```

**Pixabay special handling:** The breaker doesn't help when we *know*
the provider is broken from day one. Add a config:

```ts
const PIXABAY_DISABLED_BY_DEFAULT = true
// Only enabled when caller passes provider: 'pixabay' explicitly,
// signaling they accept the Cloudflare block risk.
```

**Acceptance:**
- 3 forced failures → 4th call throws `ProviderUnavailableError`
  immediately without hitting the provider
- After 10 minutes, next call probes the provider
- Probe success resets state to CLOSED + cooldown back to 10min
- Pixabay default `searchImage` call skips the provider entirely
- Vitest covers state machine: closed → open → half-open → closed,
  closed → open → half-open → open (with doubled cooldown)

---

## Order of operations (when you pick this up)

1. **Worktree**: `enter-worktree week3-tts-resilience` or similar
2. **PR-1 — Circuit breaker** (4h, smallest, no schema change)
   - `packages/media/src/circuit-breaker.ts` + tests
   - Wrap all 5 image providers
   - Pixabay default-disabled
3. **PR-2 — TTS Provider abstraction** (4h, also small)
   - Extract `TtsProvider` interface
   - Move `edge-tts.ts` → `tts/edge.ts` behind it
   - No new dependency, no behavior change
4. **PR-3 — Doctor health checks** (1h)
   - Edge TTS endpoint ping
   - All 5 image-provider URL probes (use the same breaker awareness)
5. **PR-4 — Piper TTS fallback** (1.5–2 days, biggest)
   - This is the heavy one — Piper binary install, model download,
     word-boundary estimation, schema enum update, registry failover
   - Defer until layers 1–3 are merged

Each PR is independent. You can stop after PR-3 and the codebase is
already meaningfully more resilient — Piper integration only matters
the day Edge TTS truly dies, which may never happen.

---

## Decisions left to you

These intentionally weren't picked in this plan because they need
your judgment, not just code:

1. **Piper voice quality tolerance.** Listen to a sample of
   `vi_VN-vais1000-medium` before committing. If it sounds too robotic
   for your audience, skip layer 2 and rely on layers 1 + 3 only.
2. **Word-boundary estimation accuracy.** Coarse estimation breaks
   karaoke alignment. Decide whether "good enough on fallback voice" is
   acceptable, or whether you want forced alignment (heavier dep).
3. **Cooldown defaults.** 10 minutes is conservative — image providers
   usually recover faster. If your users complain, drop to 2 minutes.
4. **Logging vs UI surfacing.** Right now the breaker only logs. Future
   work could surface "Pexels temporarily unavailable" in the Studio
   MusicPicker / ImagePicker, so users know why their fallback fired.

---

## Files this plan touches if executed in full

```
NEW:
  packages/media/src/circuit-breaker.ts
  packages/media/src/circuit-breaker.test.ts
  packages/media/src/tts/types.ts
  packages/media/src/tts/edge.ts            (moved from edge-tts.ts)
  packages/media/src/tts/piper.ts
  packages/media/src/tts/registry.ts
  packages/media/src/tts/registry.test.ts
  scripts/install-piper.mjs

MODIFIED:
  packages/media/src/pexels.ts              (wrap with breaker)
  packages/media/src/unsplash.ts
  packages/media/src/pixabay.ts             (wrap + default-disable)
  packages/media/src/openverse.ts
  packages/media/src/wikimedia.ts
  packages/media/src/index.ts               (re-export tts/ subtree)
  packages/shared/src/schema.ts             (add 'piper' to provider enum)
  packages/shared/src/schema.test.ts        (round-trip with new provider)
  scripts/doctor.mjs                        (health-check additions)
```

---

## Notes from the original analysis

The TTS resilience risk was tagged **Trung** (medium) in the original
seven-risk audit. The Pixabay-specific issue was tagged **Trung** as
well — both because the failure mode is real but the workaround
(other providers / pre-cached tracks) is good enough that users today
don't notice. That ranking is the reason this plan was deferred rather
than slotted into the immediate post-Tuần-2 sprint.

If a user starts reporting "voice generation hangs" or "Pexels search
hangs" with any frequency, jump on **PR-1 (circuit breaker)** first —
it's the cheapest single win.
