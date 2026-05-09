import { signal, computed, createComponent } from "sinwan";

export const Counter = createComponent(() => {
  const count = signal(0);
  const isZero = computed(() => count.value === 0);

  return (
    <>
      <div class="row">
        <div class="metric">
          {count} <small>clicks</small>
        </div>
      </div>
      <div class="row">
        <button onClick={() => (count.value += 1)}>+1</button>
        <button onClick={() => (count.value += 5)}>+5</button>
        <button class="secondary" disabled={isZero} onClick={() => (count.value = 0)}>
          Reset
        </button>
      </div>
    </>
  );
});
