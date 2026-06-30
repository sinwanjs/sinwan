import { cc, Show } from "sinwan/component";
import { createMutable } from "sinwan/store";
import { effect } from "sinwan/reactivity";
import { useState } from "sinwan/react-client";

const MutableDemo = cc(() => {
  const [test, setTest] = useState("props-test-from-react");

  const state = createMutable({
    name: "",
    test: "props-test-from-contact",
    count: 0,
    show: true,
  });

  effect(() => {
    console.log("name changed:", state.name);
  });

  const updateName = (event: Event) => {
    const target = event.target as HTMLInputElement;
    state.name = target.value;
  };

  return (
    <div style="padding: 20px;">
      <h1>createMutable demo</h1>

      <p>{test}</p>
      <p>Test: {state.test}</p>

      <input
        id="name"
        type="text"
        oninput={updateName}
        placeholder="Enter your name"
        style="padding: 8px; margin: 4px;"
      />
      <p>Hello, {state.name}!</p>

      <p>Count: {state.count}</p>
      <button
        onclick={() => state.count++}
        style="padding: 8px 16px; margin: 4px;"
      >
        +
      </button>
      <button
        onclick={() => state.count--}
        style="padding: 8px 16px; margin: 4px;"
      >
        -
      </button>

      <button
        onclick={() => (state.show = !state.show)}
        style="padding: 8px 16px; margin: 4px;"
      >
        Toggle
      </button>
      <Show when={state.show}>
        <p>Visible block</p>
      </Show>
      <Show when={!state.show}>
        <p>Hidden</p>
      </Show>
    </div>
  );
});

export default MutableDemo;
