import { cc, Switch, Match, For } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { useState } from "sinwan/react-client";

const SwitchTest = cc<{ test: string }>(({ test }) => {
  const [tests, setTests] = useState([1, 2, 3, 4, 5]);
  const showSwitch = signal(true);

  return (
    <>
      <h1>test page</h1>

      <Switch
        when={showSwitch}
        fallback={<p>Switch is hidden (toggle to show)</p>}
      >
        <Match when={() => tests().some((t) => t > 10)}>
          <div>At least one number is &gt; 10</div>
        </Match>
        <Match when={() => tests().some((t) => t > 0)}>
          <div>At least one number is &gt; 0</div>
        </Match>
      </Switch>

      <For each={tests}>{(test) => <div>{test}</div>}</For>

      <button onClick={() => setTests([6, 7, 8, 9, 10])}>
        Change Tests to be
      </button>
      <button onClick={() => (showSwitch.value = !showSwitch.value)}>
        Toggle Switch
      </button>
    </>
  );
});

export default SwitchTest;
