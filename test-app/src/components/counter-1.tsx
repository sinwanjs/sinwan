import { Show } from "sinwan";
import { Match } from "sinwan";
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
      <Show when={isEven}>
        <p>Count is even</p>
      </Show>
      <Switch>
        <Match when={() => count.value === 0}>
          <p>Count is zero</p>
        </Match>
        <Match when={() => count.value === 1}>
          <p>Count is one</p>
        </Match>
        <Match when={() => count.value === 2}>
          <p>Count is two</p>
        </Match>
        <Match when={() => count.value === 3}>
          <p>Count is three</p>
        </Match>
      </Switch>
      {() =>
        count.value === 1 ? <p>Count is one</p> : <p>Count is not one</p>
      }
    </div>
  );
});
