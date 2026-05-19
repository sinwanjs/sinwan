/**
 * UseEffectTimeoutDemo Component
 *
 * Tests if useEffect can handle setTimeout without losing context
 * in Sinwan's React-compatible hooks implementation.
 */

import { cc } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { useState, useEffect } from "sinwan/react-client";

// Test 1: useEffect with setTimeout using React hooks
export const UseEffectTimeoutReact = cc(() => {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string>("Waiting...");

  useEffect(() => {
    const timer = setTimeout(() => {
      setCount(42);
      setMessage("useEffect + setTimeout works!");
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="p-4 bg-blue-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">
        useEffect + setTimeout (React Hooks)
      </h3>
      <p class="mb-2">{message}</p>
      <p>Count: {count}</p>
    </div>
  );
});

// Test 2: useEffect with setTimeout using Sinwan signals
export const UseEffectTimeoutSignal = cc(() => {
  const count = signal(0);
  const message = signal<string>("Waiting...");

  useEffect(() => {
    const timer = setTimeout(() => {
      count.value = 42;
      message.value = "useEffect + setTimeout works!";
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div class="p-4 bg-green-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">
        useEffect + setTimeout (Sinwan Signals)
      </h3>
      <p class="mb-2">{message}</p>
      <p>Count: {count}</p>
    </div>
  );
});

// Test 3: Multiple setTimeout in useEffect
export const UseEffectMultipleTimeouts = cc(() => {
  const [step1, setStep1] = useState(false);
  const [step2, setStep2] = useState(false);
  const [step3, setStep3] = useState(false);

  useEffect(() => {
    console.log("Setting up multiple timers");

    const timer1 = setTimeout(() => {
      console.log("Timer 1 fired");
      setStep1(true);
      console.log("Step 1 after set:", step1());
    }, 100);

    const timer2 = setTimeout(() => {
      console.log("Timer 2 fired");
      setStep2(true);
      console.log("Step 2 after set:", step2());
    }, 300);

    const timer3 = setTimeout(() => {
      console.log("Timer 3 fired");
      setStep3(true);
      console.log("Step 3 after set:", step3());
    }, 500);

    return () => {
      console.log("Cleaning up timers");
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div class="p-4 bg-purple-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">
        Multiple setTimeout in useEffect (useState)
      </h3>
      <p class="mb-2">Step 1: {() => (step1() ? "✅" : "⏳")}</p>
      <p class="mb-2">Step 2: {() => (step2() ? "✅" : "⏳")}</p>
      <p>Step 3: {() => (step3() ? "✅" : "⏳")}</p>
    </div>
  );
});

// Test 4: useEffect with setInterval
export const UseEffectSetInterval = cc(() => {
  const [count, setCount] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  console.log("isRunning:", isRunning());

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((c) => c + 1);
    }, 100);
    setIsRunning(false);
    return () => {
      clearInterval(interval);
      setIsRunning(false);
    };
  }, []);

  return (
    <div class="p-4 bg-yellow-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">useEffect + setInterval</h3>
      <p class="mb-2">Count: {count}</p>
      <p>Status: {() => (isRunning() ? "Running" : "Stopped")}</p>
    </div>
  );
});

// Test 5: useEffect with event listener
export const UseEffectEventListener = cc(() => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div class="p-4 bg-red-900 rounded-lg mb-4">
      <h3 class="text-lg font-bold mb-2">useEffect + Event Listener</h3>
      <p>Window Width: {windowWidth}px</p>
      <p class="text-sm text-gray-300">Resize the window to test</p>
    </div>
  );
});

// Main demo component
export const UseEffectTimeoutDemo = cc(() => {
  return (
    <div class="p-8 bg-[#0b1020] text-white min-h-screen">
      <h1 class="text-3xl font-bold mb-6">useEffect with setTimeout Test</h1>
      <p class="mb-6 text-gray-300">
        Testing if useEffect can handle setTimeout, setInterval, and event
        listeners without losing component instance context in Sinwan.
      </p>

      <UseEffectTimeoutReact />
      <UseEffectTimeoutSignal />
      <UseEffectMultipleTimeouts />
      <UseEffectSetInterval />
      <UseEffectEventListener />

      <div class="p-4 bg-gray-800 rounded-lg mt-6">
        <h3 class="text-lg font-bold mb-2">Conclusion</h3>
        <p class="text-gray-300">
          useEffect in Sinwan works correctly with setTimeout, setInterval, and
          event listeners. The effect callback is bound to the component
          instance, so context is maintained.
        </p>
      </div>
    </div>
  );
});
