import { Show } from "sinwan";
import { Match } from "sinwan";
import { For } from "sinwan";
import { Switch } from "sinwan";
import { computed } from "sinwan";
import { signal, createComponent, onMounted } from "sinwan";

export const Counter = createComponent(() => {
  const count = signal(0);
  const isEven = computed(() => count.value % 2 === 0);
  const is = (n: number) => computed(() => count.value === n);

  onMounted(() => {
    console.log("Counter mounted");
  });

  return (
    <div class="counter">
      <p>You clicked the button {count} times.</p>
      <button onClick={() => (count.value += 1)}>Increment</button>
      <button onClick={() => (count.value = 0)}>Reset</button>
      <Switch>
        <For each={[0, 1, 2, 3, 4]}>
          {(n) => (
            <Match when={is(n)}>
              <Show when={isEven}>
                <p>Count is even.</p>
              </Show>
              <Show when={!isEven}>
                <p>Count is odd.</p>
              </Show>
            </Match>
          )}
        </For>
      </Switch>
    </div>
  );
});
