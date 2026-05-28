import { cc } from "sinwan/component";
import { useEffect, useState } from "sinwan/react-client";

/**
 * Counter - Normal interactive component (NOT an island)
 * Fully hydrated by the main hydrate() call
 */
export const Counter = cc<{ initial?: number }>(({ initial = 0 }) => {
  const [count, setCount] = useState(initial);
  const [test, setTest] = useState(0);

  const handel = () => {
    setCount((c: number) => c + 1);
    setTest((t: number) => t + 1);
    console.log("Counter clicked", count());
  };

  useEffect(() => {
    console.log("Counter rendered", count());
  }, []);

  return (
    <div style="padding: 20px; border: 2px solid #3498db; border-radius: 8px; margin: 10px 0;">
      <h3>Interactive Counter</h3>
      <p>Count: {count}</p>
      <p>Test: {test}</p>
      <button
        onClick={handel}
        style="padding: 8px 16px; margin: 4px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        +
      </button>
      <button
        onClick={() => setCount((c: number) => c - 1)}
        style="padding: 8px 16px; margin: 4px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        -
      </button>
    </div>
  );
});
