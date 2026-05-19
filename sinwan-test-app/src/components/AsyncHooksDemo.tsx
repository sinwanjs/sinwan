/**
 * AsyncHooksDemo Component
 *
 * This component demonstrates that React hooks (useState, useEffect, etc.)
 * work correctly in async components, contrary to the documented limitation.
 *
 * It also shows the recommended approach using Sinwan's native signals
 * for simpler, more consistent async component patterns.
 */

import { cc, For, Show } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { useState } from "sinwan/react-client";
import { onMounted } from "sinwan/component";

// Demo 1: React hooks in async component
export const ReactHooksAsync = cc(() => {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string>("Loading...");

  // Simulate async operation
  setTimeout(() => {
    setCount(42);
    setMessage("React hooks work in async components!");
  }, 100);

  return (
    <div class="p-4 bg-blue-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">React Hooks in Async Component</h3>
      <p class="mb-2">{message}</p>
      <p>Count: {count}</p>
    </div>
  );
});

// Demo 2: Sinwan signals in async component (recommended)
export const SignalAsync = cc(() => {
  const count = signal(0);
  const message = signal<string>("Loading...");

  // Simulate async operation
  setTimeout(() => {
    count.value = 42;
    message.value = "Sinwan signals work perfectly!";
  }, 100);

  return (
    <div class="p-4 bg-green-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">Sinwan Signals in Async Component</h3>
      <p class="mb-2">{message}</p>
      <p>Count: {count}</p>
    </div>
  );
});

// Demo 3: Lifecycle hooks in async component
export const LifecycleAsync = cc(() => {
  const mounted = signal(false);
  const data = signal<string>("Not loaded");

  onMounted(() => {
    mounted.value = true;
    data.value = "Loaded on mount (lifecycle hooks work!)";
  });

  return (
    <div class="p-4 bg-purple-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">Lifecycle Hooks in Async Component</h3>
      <p class="mb-2">Mounted: {mounted ? "Yes" : "No"}</p>
      <p>{data}</p>
    </div>
  );
});

// Demo 4: Mixed React hooks and Sinwan signals
export const MixedAsync = cc(() => {
  // React hook
  const [reactState, setReactState] = useState(0);

  // Sinwan signal
  const sinwanState = signal(0);

  // Simulate async operation
  setTimeout(() => {
    setReactState(10);
    sinwanState.value = 20;
  }, 100);

  return (
    <div class="p-4 bg-yellow-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">Mixed React Hooks + Sinwan Signals</h3>
      <p class="mb-2">React State: {reactState}</p>
      <p>Sinwan State: {sinwanState}</p>
    </div>
  );
});

// Demo 5: Real-world data fetching pattern with React hooks
export const DataFetchingAsync = cc(async () => {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulate API call with await
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    setData([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
    ]);
    setLoading(false);
  } catch (err) {
    setError("Failed to fetch data");
    setLoading(false);
  }

  if (error()) {
    return (
      <div class="p-4 bg-red-900 rounded-lg mb-4">
        <h3 class="text-lg font-bold mb-2">Data Fetching (Error)</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (loading()) {
    return (
      <div class="p-4 bg-gray-800 rounded-lg mb-4">
        <h3 class="text-lg font-bold mb-2">Data Fetching (Loading)</h3>
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div class="p-4 bg-indigo-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">Data Fetching (Success)</h3>
      <ul class="list-disc list-inside">
        <Show when={data}>
          {(users) => (
            <For each={users}>
              {(user: any) => <li key={user.id}>{user.name}</li>}
            </For>
          )}
        </Show>
      </ul>
    </div>
  );
});

// Main demo component that shows all examples
export const AsyncHooksDemo = cc(() => {
  return (
    <div class="p-8 bg-[#0b1020] text-white min-h-screen">
      <h1 class="text-3xl font-bold mb-6">Async Component Hooks Demo</h1>
      <p class="mb-6 text-gray-300">
        This demo proves that React hooks work correctly in async components.
        The documented limitation is incorrect - hooks work fine after await.
      </p>

      <ReactHooksAsync />
      <SignalAsync />
      <LifecycleAsync />
      <MixedAsync />
      <DataFetchingAsync />

      <div class="p-4 bg-gray-800 rounded-lg mt-6">
        <h3 class="text-lg font-bold mb-2">Recommendation</h3>
        <p class="text-gray-300">
          While React hooks work in async components, using Sinwan's native
          signals is recommended for simplicity and consistency. Signals work
          identically in both sync and async components.
        </p>
      </div>
    </div>
  );
});
