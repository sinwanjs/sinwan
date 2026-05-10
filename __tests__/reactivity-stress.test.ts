
import { describe, it, expect } from "bun:test";
import { signal, computed, effect, batch, nextTick } from "../src/reactivity/index.ts";

describe("Reactivity — Stress Tests", () => {
  it("should handle deep dependency chains (1000 nodes)", async () => {
    const start = signal(0);
    let current = start;

    for (let i = 0; i < 1000; i++) {
      const prev = current;
      current = computed(() => prev.value + 1) as any;
    }

    expect(current.value).toBe(1000);

    start.value = 1;
    await nextTick();
    expect(current.value).toBe(1001);

    start.value = 10;
    await nextTick();
    expect(current.value).toBe(1010);
  });

  it("should handle wide fan-out (10,000 subscribers)", async () => {
    const source = signal(0);
    const count = 10000;
    const results: number[] = new Array(count).fill(0);

    for (let i = 0; i < count; i++) {
      effect(() => {
        results[i] = source.value;
      });
    }

    source.value = 1;
    await nextTick();
    for (let i = 0; i < count; i++) {
      expect(results[i]).toBe(1);
    }

    source.value = 42;
    await nextTick();
    for (let i = 0; i < count; i++) {
      expect(results[i]).toBe(42);
    }
  });

  it("should handle wide fan-in (10,000 dependencies)", async () => {
    const signals = Array.from({ length: 10000 }, (_, i) => signal(i));
    const sum = computed(() => {
      return signals.reduce((acc, s) => acc + s.value, 0);
    });

    const expectedInitialSum = (9999 * 10000) / 2;
    expect(sum.value).toBe(expectedInitialSum);

    batch(() => {
      signals[0].value = 10;
      signals[5000].value = 20;
      signals[9999].value = 30;
    });

    await nextTick();
    // 0 -> 10 (+10)
    // 5000 -> 20 (-4980)
    // 9999 -> 30 (-9969)
    // Diff: 10 - 4980 - 9969 = -14939
    expect(sum.value).toBe(expectedInitialSum - 14939);
  });

  it("should handle diamond dependency pattern", async () => {
    const a = signal(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);
    
    let callCount = 0;
    effect(() => {
      d.value;
      callCount++;
    });

    expect(d.value).toBe(5);
    expect(callCount).toBe(1);

    a.value = 2;
    await nextTick();
    expect(d.value).toBe(10);
    expect(callCount).toBe(2); // Should only run once per update
  });

  it("should handle rapid batch updates (10,000 updates)", async () => {
    const a = signal(0);
    const b = computed(() => a.value * 2);
    let effectCount = 0;
    
    effect(() => {
      b.value;
      effectCount++;
    });

    batch(() => {
      for (let i = 0; i < 10000; i++) {
        a.value = i;
      }
    });

    await nextTick();
    expect(a.value).toBe(9999);
    expect(b.value).toBe(19998);
    expect(effectCount).toBe(2); // Initial run + 1 batch update
  });

  it("should handle effect churn (creating and destroying many effects)", async () => {
    const source = signal(0);
    const iterationCount = 100;
    const effectsPerIteration = 100;
    
    for (let i = 0; i < iterationCount; i++) {
      const disposers: (() => void)[] = [];
      for (let j = 0; j < effectsPerIteration; j++) {
        const stop = effect(() => {
          source.value;
        });
        disposers.push(stop);
      }
      // Trigger update
      source.value++;
      await nextTick();
      
      // Cleanup
      disposers.forEach(stop => stop());
    }
    
    // Final check
    source.value = 999;
    await nextTick();
    // No more active effects from previous iterations should be running
  });

  it("should handle nested batch updates", async () => {
    const a = signal(0);
    const b = signal(0);
    const sum = computed(() => a.value + b.value);
    let runCount = 0;

    effect(() => {
      sum.value;
      runCount++;
    });

    batch(() => {
      a.value = 1;
      batch(() => {
        b.value = 2;
        a.value = 3;
      });
      b.value = 4;
    });

    await nextTick();
    expect(a.value).toBe(3);
    expect(b.value).toBe(4);
    expect(sum.value).toBe(7);
    expect(runCount).toBe(2); // Initial + 1 batch
  });
  
  it("should handle recursive computed access during update", async () => {
    const a = signal(1);
    const b = computed(() => a.value + 1);
    const c = computed(() => b.value + a.value);
    
    expect(c.value).toBe(3);
    
    a.value = 5;
    await nextTick();
    expect(c.value).toBe(11); // b=6, a=5
  });
});
