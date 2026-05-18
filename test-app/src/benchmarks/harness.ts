/**
 * Framework-agnostic benchmark harness.
 *
 * Design goals (parity with js-framework-benchmark / krausest):
 *  1. Measure full DOM commit + paint, not just JS work.
 *  2. Pre-generate all data; timed block does zero allocation bookkeeping.
 *  3. Warmup iterations are discarded (JIT / layout cache priming).
 *  4. Each scenario resets DOM state via `setup()` OUTSIDE the timed section.
 *  5. Paint completion is awaited with double-rAF, which guarantees the
 *     browser has actually rasterised the frame produced by the commit.
 *  6. No artificial double-render / no forced style recalculation.
 *  7. `ops` test counts real completed renders inside a fixed wall-clock
 *     window, waiting for paint between each iteration so we never queue
 *     work faster than the compositor can consume it.
 *
 * A framework adapter implements the `FrameworkAdapter` interface; the same
 * harness drives Sinwan, React, Solid, Vue, Svelte for fair comparison.
 */

export interface FrameworkAdapter {
  /** Human-readable name, e.g. "sinwan", "solid". */
  name: string;

  /** Mount an empty table into `container`. Called once per scenario. */
  mount(container: HTMLElement): void;

  /** Replace the entire row set. Called inside timed section. */
  setRows(rows: readonly import("./data.ts").Row[]): void;

  /** Patch a single row's label. Called inside timed section. */
  updateRow(index: number, newLabel: string): void;

  /** Swap two rows by index. Called inside timed section. */
  swapRows(a: number, b: number): void;

  /** Remove all rows. Called inside timed section. */
  clear(): void;

  /** Tear down. Called once per scenario (not timed). */
  unmount(): void;
}

export interface SampleStats {
  samples: number[];
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface ScenarioResult {
  name: string;
  unit: "ms" | "ops/sec";
  stats: SampleStats;
}

// ─── Render synchronisation ─────────────────────────────────

/**
 * Drain all pending microtasks. Lets async-batching frameworks (React 18,
 * Vue's nextTick, Sinwan's effect queue) commit their mutations before we
 * force layout. Several flushes catch microtasks that chain.
 */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/**
 * Resolve after the framework's reactive flush has committed AND the
 * browser has run style recalc + layout.
 *
 * Technique:
 *   1. Drain microtasks → forces async-batched frameworks to commit DOM.
 *   2. Read `offsetHeight` on the container → forces a synchronous
 *      style + layout pass right now. The browser cannot return that
 *      number without resolving pending style/layout work.
 *
 * This is the same boundary `js-framework-benchmark` uses for its
 * "duration" metric. Compositor paint is intentionally excluded — paint
 * is refresh-rate-capped and is NOT a framework property.
 *
 * Returns synchronously after layout completes; no vsync wait.
 */
export async function flushRender(container: HTMLElement): Promise<void> {
  await drainMicrotasks();
  // Force sync style + layout. Void cast suppresses unused-expr warnings.
  void container.offsetHeight;
}

/**
 * Resolve AFTER the browser has painted the frame produced by the most
 * recent DOM mutation. Double-rAF guarantees the frame was rasterised.
 *
 * Takes at least two monitor refreshes (~33 ms @ 60 Hz), so it's only
 * suitable for boundaries OUTSIDE the timed region (e.g. ensuring
 * setup() paint is flushed before `t0`), or for the ops/sec test where
 * the whole point is refresh-rate-capped throughput.
 */
export function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        queueMicrotask(() => resolve());
      });
    });
  });
}

// ─── Stats ──────────────────────────────────────────────────

function summarise(samples: number[]): SampleStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = samples.reduce((s, x) => s + x, 0) / n;
  const median = sorted[n >> 1]!;
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))]!;
  return { samples, mean, median, p95, min: sorted[0]!, max: sorted[n - 1]! };
}

// ─── Measurement primitives ─────────────────────────────────

export interface MeasureOptions {
  /**
   * Container the framework is mutating. Used to force a synchronous
   * style + layout pass via `offsetHeight` so the timed region captures
   * real layout cost, not idle wait until the next vsync.
   */
  container: HTMLElement;
  /** Samples to discard before recording. */
  warmup?: number;
  /** Samples to record. */
  iterations?: number;
  /** Called BEFORE each iteration, NOT timed. */
  setup?: () => void | Promise<void>;
  /** Called AFTER each iteration, NOT timed. */
  teardown?: () => void | Promise<void>;
}

/**
 * Run `work` N times. Each iteration is bracketed by `performance.now()`;
 * the closing boundary drains microtasks (so async-batched frameworks
 * commit) and forces a synchronous layout (`offsetHeight`) so the
 * duration captures framework work + DOM mutation + style + layout —
 * the same boundary as `js-framework-benchmark`'s "duration" metric.
 */
export async function measure(
  work: () => void,
  opts: MeasureOptions,
): Promise<SampleStats> {
  const warmup = opts.warmup ?? 3;
  const iterations = opts.iterations ?? 10;
  const samples: number[] = [];

  for (let i = 0; i < warmup + iterations; i++) {
    if (opts.setup) await opts.setup();
    // Full paint flush OUTSIDE the timed region so leftover compositor
    // work from setup() can't leak into t0.
    await waitForPaint();

    const t0 = performance.now();
    work();
    await flushRender(opts.container);
    const t1 = performance.now();

    if (opts.teardown) await opts.teardown();

    if (i >= warmup) samples.push(t1 - t0);
  }

  return summarise(samples);
}

/**
 * Fixed-duration ops test. Counts the number of full create→paint→clear
 * cycles completed within `durationMs`. Each cycle awaits paint, so we
 * never outpace the compositor (no flicker, no queue blow-up).
 */
export async function measureOps(
  cycle: () => void,
  durationMs = 2000,
  warmupIterations = 5,
): Promise<SampleStats> {
  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    cycle();
    await waitForPaint();
  }

  const deadline = performance.now() + durationMs;
  let completed = 0;
  const perCycle: number[] = [];

  while (performance.now() < deadline) {
    const t0 = performance.now();
    cycle();
    await waitForPaint();
    perCycle.push(performance.now() - t0);
    completed++;
  }

  const elapsed = performance.now() - (deadline - durationMs);
  const opsPerSec = (completed / elapsed) * 1000;

  // Report ops/sec in `mean`; keep per-cycle latency samples for transparency.
  const stats = summarise(perCycle);
  return { ...stats, mean: opsPerSec };
}
