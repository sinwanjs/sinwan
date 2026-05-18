/**
 * Benchmark runner entry.
 *
 * Run via a dedicated HTML page (e.g. /bench.html) that imports this module,
 * so the main app UI does not contaminate layout costs.
 *
 * Scenarios (parity with js-framework-benchmark):
 *   1. create    — render 1 000 rows
 *   2. createLg  — render 10 000 rows
 *   3. update    — patch a single row in a 1 000-row table
 *   4. swap      — swap two rows in a 1 000-row table
 *   5. clear     — remove all 1 000 rows
 *   6. ops       — repeated create/clear cycles over 2 s wall-clock
 *
 * Every timed block:
 *   - consumes a pre-generated dataset (no RNG in hot path),
 *   - awaits double-rAF + microtask flush (guarantees paint),
 *   - separates warmup from recorded iterations.
 */

import { buildData, resetIds } from "./data.ts";
import {
  measure,
  measureOps,
  type FrameworkAdapter,
  type ScenarioResult,
} from "./harness.ts";
import { createSinwanAdapter } from "./sinwan-bench.tsx";

const SMALL = 1_000;
const LARGE = 10_000;

async function runScenarios(
  adapter: FrameworkAdapter,
  host: HTMLElement,
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  // Pre-generate every dataset we'll need. Zero allocation in timed code.
  resetIds();
  const smallSets = Array.from({ length: 15 }, () => buildData(SMALL));
  const largeSets = Array.from({ length: 8 }, () => buildData(LARGE));
  const updateLabel = "!!! UPDATED !!!";

  // ── 1. create 1k ───────────────────────────────────────────
  {
    let i = 0;
    adapter.mount(host);
    const stats = await measure(() => adapter.setRows(smallSets[i++]!), {
      container: host,
      warmup: 3,
      iterations: 10,
      setup: () => adapter.clear(),
    });
    adapter.unmount();
    results.push({ name: "create 1k", unit: "ms", stats });
  }

  // ── 2. create 10k ──────────────────────────────────────────
  {
    let i = 0;
    adapter.mount(host);
    const stats = await measure(() => adapter.setRows(largeSets[i++]!), {
      container: host,
      warmup: 2,
      iterations: 5,
      setup: () => adapter.clear(),
    });
    adapter.unmount();
    results.push({ name: "create 10k", unit: "ms", stats });
  }

  // ── 3. update 1 of 1k ──────────────────────────────────────
  {
    adapter.mount(host);
    adapter.setRows(smallSets[0]!);
    let tick = 0;
    const stats = await measure(
      () => adapter.updateRow((tick * 13) % SMALL, `${updateLabel} ${tick++}`),
      { container: host, warmup: 5, iterations: 25 },
    );
    adapter.unmount();
    results.push({ name: "update 1/1k", unit: "ms", stats });
  }

  // ── 4. swap ────────────────────────────────────────────────
  {
    adapter.mount(host);
    adapter.setRows(smallSets[0]!);
    const stats = await measure(() => adapter.swapRows(1, SMALL - 2), {
      container: host,
      warmup: 5,
      iterations: 25,
    });
    adapter.unmount();
    results.push({ name: "swap", unit: "ms", stats });
  }

  // ── 5. clear ───────────────────────────────────────────────
  {
    let i = 0;
    adapter.mount(host);
    const stats = await measure(() => adapter.clear(), {
      container: host,
      warmup: 3,
      iterations: 10,
      setup: () => adapter.setRows(smallSets[i++ % smallSets.length]!),
    });
    adapter.unmount();
    results.push({ name: "clear 1k", unit: "ms", stats });
  }

  // ── 6. ops/sec (2 s, create 1k + clear per cycle) ──────────
  {
    adapter.mount(host);
    let i = 0;
    const stats = await measureOps(() => {
      adapter.setRows(smallSets[i++ % smallSets.length]!);
      adapter.clear();
    }, 2000);
    adapter.unmount();
    results.push({ name: "ops (create+clear 1k)", unit: "ops/sec", stats });
    // Also surface per-cycle latency: the ops/sec figure is compositor-capped
    // (double-rAF ≈ 2 frames ≈ 33 ms on a 60 Hz display → ~30 ops/sec ceiling),
    // so the *discriminating* number between frameworks is cycle latency.
    results.push({
      name: "ops cycle latency",
      unit: "ms",
      stats,
    });
  }

  return results;
}

function renderReport(
  framework: string,
  results: ScenarioResult[],
  out: HTMLElement,
): void {
  const rows = results
    .map((r) => {
      const v = r.unit === "ops/sec" ? r.stats.mean : r.stats.median;
      // Derived ops/sec: 1000 / median latency. This is the convention used
      // by reports like "SolidJS — 42.8 ops/sec on Create 1K" — NOT a real
      // wall-clock throughput, just `1 / latency`. Useful for direct
      // comparison with such tables.
      const derivedOps =
        r.unit === "ms" && r.stats.median > 0
          ? (1000 / r.stats.median).toFixed(1)
          : "—";
      return `
        <tr>
          <td>${r.name}</td>
          <td class="num">${v.toFixed(2)}</td>
          <td class="num">${r.stats.mean.toFixed(2)}</td>
          <td class="num">${r.stats.p95.toFixed(2)}</td>
          <td class="num">${r.stats.min.toFixed(2)}</td>
          <td class="num">${r.stats.max.toFixed(2)}</td>
          <td>${r.unit}</td>
          <td class="num">${derivedOps}</td>
        </tr>`;
    })
    .join("");
  out.innerHTML = `
    <h2>Results — ${framework}</h2>
    <table class="bench-report">
      <thead>
        <tr>
          <th>scenario</th><th>median / ops·s⁻¹</th><th>mean</th>
          <th>p95</th><th>min</th><th>max</th><th>unit</th>
          <th>ops/sec (derived)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function main(): Promise<void> {
  const report = document.getElementById("report")!;
  const stage = document.getElementById("stage") as HTMLElement;
  const runBtn = document.getElementById("run") as HTMLButtonElement;

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    report.textContent = "Running…";
    const adapter = createSinwanAdapter();
    try {
      const results = await runScenarios(adapter, stage);
      renderReport(adapter.name, results, report);
      // Machine-readable dump for CI / regression comparison.
      (window as any).__BENCH_RESULTS__ = { framework: adapter.name, results };
      console.log("BENCH", JSON.stringify(results, null, 2));
    } finally {
      stage.innerHTML = "";
      runBtn.disabled = false;
    }
  });
}

main();
