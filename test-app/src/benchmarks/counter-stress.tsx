/**
 * Stress test for the Counter component.
 *
 * Tests rapid increment operations and measures performance under load.
 */

import { measure, measureOps, type SampleStats } from "./harness.ts";
import { Counter } from "../components/counter-1.tsx";
import { mount } from "sinwan/renderer";

interface CounterAdapter {
  mount(container: HTMLElement): void;
  increment(): void;
  reset(): void;
  unmount(): void;
  getCount(): number;
}

function createCounterAdapter(): CounterAdapter {
  let app: { unmount(): void } | null = null;
  let incrementBtn: HTMLButtonElement | null = null;
  let resetBtn: HTMLButtonElement | null = null;
  let countDisplay: HTMLElement | null = null;

  return {
    mount(container: HTMLElement): void {
      container.innerHTML = "";
      app = mount(Counter, container);

      // Wait for DOM to be ready, then find elements
      setTimeout(() => {
        const buttons = container.querySelectorAll("button");
        incrementBtn = buttons[0] as HTMLButtonElement;
        resetBtn = buttons[1] as HTMLButtonElement;
        const paragraphs = container.querySelectorAll("p");
        countDisplay = paragraphs[0];
      }, 0);
    },

    increment(): void {
      if (incrementBtn) {
        incrementBtn.click();
      }
    },

    reset(): void {
      if (resetBtn) {
        resetBtn.click();
      }
    },

    unmount(): void {
      if (app) {
        app.unmount();
        app = null;
      }
      incrementBtn = null;
      resetBtn = null;
      countDisplay = null;
    },

    getCount(): number {
      if (countDisplay) {
        const text = countDisplay.textContent || "";
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      }
      return 0;
    },
  };
}

async function runStressTests(
  adapter: CounterAdapter,
  host: HTMLElement,
): Promise<{ name: string; unit: string; stats: SampleStats }[]> {
  const results: { name: string; unit: string; stats: SampleStats }[] = [];

  // ── Test 1: Single increment latency ─────────────────────────────────
  {
    adapter.mount(host);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for mount

    const stats = await measure(() => adapter.increment(), {
      container: host,
      warmup: 5,
      iterations: 50,
      setup: () => adapter.reset(),
    });

    adapter.unmount();
    results.push({ name: "Single increment", unit: "ms", stats });
  }

  // ── Test 2: Rapid increments (100 operations) ───────────────────────
  {
    adapter.mount(host);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = await measure(
      () => {
        for (let i = 0; i < 100; i++) {
          adapter.increment();
        }
      },
      {
        container: host,
        warmup: 3,
        iterations: 20,
        setup: () => adapter.reset(),
      },
    );

    adapter.unmount();
    results.push({ name: "100 increments", unit: "ms", stats });
  }

  // ── Test 3: Reset operation ─────────────────────────────────────────
  {
    adapter.mount(host);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Pre-populate with some increments
    for (let i = 0; i < 50; i++) adapter.increment();

    const stats = await measure(() => adapter.reset(), {
      container: host,
      warmup: 5,
      iterations: 30,
      setup: () => {
        for (let i = 0; i < 50; i++) adapter.increment();
      },
    });

    adapter.unmount();
    results.push({ name: "Reset (from 50)", unit: "ms", stats });
  }

  // ── Test 4: Sustained ops/sec (increment + reset cycle) ─────────────
  {
    adapter.mount(host);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = await measureOps(() => {
      for (let i = 0; i < 10; i++) adapter.increment();
      adapter.reset();
    }, 2000);

    adapter.unmount();
    results.push({ name: "Ops (10 inc + reset)", unit: "ops/sec", stats });
  }

  return results;
}

function renderReport(
  results: { name: string; unit: string; stats: SampleStats }[],
  out: HTMLElement,
): void {
  const rows = results
    .map((r) => {
      const v = r.unit === "ops/sec" ? r.stats.mean : r.stats.median;
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
    <h2>Counter Stress Test Results</h2>
    <table class="bench-report">
      <thead>
        <tr>
          <th>scenario</th><th>median / ops·s⁻¹</th><th>mean</th>
          <th>p95</th><th>min</th><th>max</th><th>unit</th>
          <th>ops/sec (derived)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <style>
      .bench-report { border-collapse: collapse; margin-top: 1rem; }
      .bench-report th, .bench-report td { border: 1px solid #ccc; padding: 0.5rem; }
      .bench-report .num { text-align: right; font-family: monospace; }
    </style>
  `;
}

async function main(): Promise<void> {
  const report = document.getElementById("counter-stress-report")!;
  const stage = document.getElementById("counter-stress-stage") as HTMLElement;
  const runBtn = document.getElementById(
    "run-counter-stress",
  ) as HTMLButtonElement;

  if (!report || !stage || !runBtn) {
    console.error("Required DOM elements not found");
    return;
  }

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    report.textContent = "Running stress test…";
    const adapter = createCounterAdapter();
    try {
      const results = await runStressTests(adapter, stage);
      renderReport(results, report);
      console.log("COUNTER STRESS TEST", JSON.stringify(results, null, 2));
    } finally {
      stage.innerHTML = "";
      runBtn.disabled = false;
    }
  });
}

// Auto-run when loaded
main();
