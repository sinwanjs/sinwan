import { provide } from "../../component/provide-inject.ts";
import { REACT_CONTEXT_TYPE } from "./_internal/symbols.ts";
import type { Context, Provider, Consumer } from "./_types/context.ts";
import type { ReactNode } from "./_types/core.ts";
import { inject } from "../../component/provide-inject.ts";

let contextIdCounter = 0;

/**
 * React-compatible `createContext` — `[SHARED]`.
 *
 * SSR: safe (no DOM access).
 * Reactivity: bridge — the Provider calls Sinwan's `provide()`; consumers
 * read via `useContext` which delegates to `inject()`.
 *
 * @example
 * ```tsx
 * import { createContext, useContext } from "sinwan/react-client";
 *
 * const ThemeContext = createContext("light");
 *
 * const App = () => (
 *   <ThemeContext.Provider value="dark">
 *     <Child />
 *   </ThemeContext.Provider>
 * );
 *
 * const Child = () => {
 *   const theme = useContext(ThemeContext);
 *   return <div class={theme} />;
 * };
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const key = Symbol(`sinwan.react.context#${contextIdCounter++}`);

  const Provider: Provider<T> = ((props: {
    value: T;
    children?: ReactNode;
  }) => {
    provide(key, props.value);
    return props.children as any;
  }) as Provider<T>;
  Provider.displayName = "Context.Provider";

  const Consumer: Consumer<T> = ((props: {
    children: ((value: T) => ReactNode) | ((value: T) => ReactNode)[];
  }) => {
    const value = inject<T>(key as any, defaultValue);
    const childFn = Array.isArray(props.children)
      ? props.children[0]
      : props.children;
    return childFn(value as T) as any;
  }) as Consumer<T>;
  Consumer.displayName = "Context.Consumer";

  // React 19 `<MyContext value={x}>` shorthand: function form acts as
  // Provider when invoked as a JSX type.
  const Context = ((props: { value?: T; children?: ReactNode }) => {
    if ("value" in props) {
      provide(key, props.value as T);
    }
    return props.children as any;
  }) as Context<T>;

  Context.$$typeof = REACT_CONTEXT_TYPE;
  Context.Provider = Provider;
  Context.Consumer = Consumer;
  Context._defaultValue = defaultValue;
  Context._key = key;

  return Context;
}

/** Internal helper used by `useContext`. */
export function readContext<T>(context: Context<T>): T {
  const value = inject<T>(context._key as any, context._defaultValue);
  return value as T;
}
