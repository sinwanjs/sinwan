import {
  cc,
  onMounted,
  onUnmounted,
  provide,
  inject,
  type InjectionKey,
} from "sinwan/component";
import { signal, computed } from "sinwan/reactivity";

// import { Counter as Counter1 } from "./components/counter-1";
import { Counter } from "./components/Counter";
import { Clock } from "./components/Clock";
import { TodoList } from "./components/TodoList";
import { TempConverter } from "./components/TempConverter";
import { LifecycleLog } from "./components/LifecycleLog";
import { Signal } from "sinwan/reactivity";

// ─── Theme via provide / inject ────────────────────────────

export type Theme = "light" | "dark";
export const ThemeKey: InjectionKey<Signal<Theme>> = Symbol("theme");

const ThemeProvider = cc(({ children }) => {
  const theme = signal<Theme>("dark");
  provide(ThemeKey, theme);
  let stop: (() => void) | null = null;

  // Apply theme to <html data-theme="...">
  onMounted(() => {
    const root = document.documentElement;
    stop = theme.subscribe((t) => root.setAttribute("data-theme", t));
    root.setAttribute("data-theme", theme.peek());
  });

  onUnmounted(() => {
    stop?.();
  });

  return <>{children}</>;
});

const ThemeToggle = cc(() => {
  const theme = inject(ThemeKey)!;
  const label = computed(() =>
    theme.value === "dark" ? "🌙 Dark" : "☀️ Light",
  );
  return (
    <button
      class="secondary"
      onClick={() => (theme.value = theme.value === "dark" ? "light" : "dark")}
    >
      {label}
    </button>
  );
});

// ─── App ───────────────────────────────────────────────────

export const App = cc(() => (
  <ThemeProvider>
    <main>
      <header>
        <div>
          <h1>Sinwan Test App</h1>
          <div class="subtitle">
            Reactive UI library — fine-grained signals, no virtual DOM
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section class="card">
        <h2>Counter</h2>
        <p class="subtitle">
          Single signal, reactive text + reactive disabled attribute.
        </p>
        <Counter />
      </section>

      <section class="card">
        <h2>Clock (lifecycle)</h2>
        <p class="subtitle">
          <code>onMounted</code> starts a setInterval, <code>onUnmounted</code>{" "}
          tears it down.
        </p>
        <Clock />
      </section>

      <section class="card">
        <h2>Computed — temperature converter</h2>
        <p class="subtitle">
          A <code>signal</code> drives a <code>computed</code> that renders
          live.
        </p>
        <TempConverter />
      </section>

      <section class="card">
        <h2>Todo list</h2>
        <p class="subtitle">
          Coarse-grained list rebuild on signal change (via remount of the inner
          list block).
        </p>
        <TodoList />
      </section>

      <section class="card">
        <h2>Lifecycle log</h2>
        <p class="subtitle">
          Mount / unmount a child component and watch the hooks fire bottom-up.
        </p>
        <LifecycleLog />
      </section>
      <section class="card">
        <h2>Counter (v1)</h2>
        <p class="subtitle">
          Single signal, reactive text + reactive disabled attribute.
        </p>
        {/* <Counter1 /> */}
      </section>

      <footer>
        Powered by <a href="https://www.npmjs.com/package/sinwan">sinwan</a> ·
        v0.1.0
      </footer>
    </main>
  </ThemeProvider>
));
