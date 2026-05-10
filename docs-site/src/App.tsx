import {
  createComponent,
  signal,
  onMounted,
  provide,
  inject,
  type InjectionKey,
  type Signal,
} from "sinwan";
import { Sidebar } from "./components/Sidebar";
import { DocViewer } from "./components/DocViewer";

export type Theme = "light" | "dark";
export const ThemeKey: InjectionKey<Signal<Theme>> = Symbol("theme");
export const CurrentPageKey: InjectionKey<Signal<string>> =
  Symbol("current-page");
export const SidebarOpenKey: InjectionKey<Signal<boolean>> =
  Symbol("sidebar-open");

export interface AppProps {
  initialPage?: string;
  initialContent?: string;
}

export const App = createComponent<AppProps>(
  ({ initialPage, initialContent } = {}) => {
    const theme = signal<Theme>(
      typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    );
    const currentPage = signal(initialPage || "00-philosophy.md");
    const sidebarOpen = signal(false);
    const initialContentSignal = signal(initialContent || "");

    provide(ThemeKey, theme);
    provide(CurrentPageKey, currentPage);
    provide(SidebarOpenKey, sidebarOpen);
    provide(Symbol("initialContent"), initialContentSignal);

    onMounted(() => {
      const root = document.documentElement;
      const stop = theme.subscribe((t) => root.setAttribute("data-theme", t));
      root.setAttribute("data-theme", theme.peek());

      const hash = window.location.hash.slice(1);
      if (hash) currentPage.value = hash;

      const handleHashChange = () => {
        const newHash = window.location.hash.slice(1);
        if (newHash) currentPage.value = newHash;
      };
      window.addEventListener("hashchange", handleHashChange);

      return () => {
        stop();
        window.removeEventListener("hashchange", handleHashChange);
      };
    });

    return (
      <div class="app-shell">
        <button
          class={() => `sidebar-backdrop ${sidebarOpen.value ? "is-open" : ""}`}
          aria-hidden={sidebarOpen.value ? "false" : "true"}
          tabIndex={sidebarOpen.value ? 0 : -1}
          onClick={() => (sidebarOpen.value = false)}
        />
        <div class="app-orb app-orb-a" aria-hidden="true" />
        <div class="app-orb app-orb-b" aria-hidden="true" />
        <Sidebar />
        <main class="main-content">
          <section class="content-frame">
            <header class="content-header">
              <div class="content-header-copy">
                <button
                  class="sidebar-toggle"
                  type="button"
                  aria-label="Open navigation menu"
                  aria-expanded={sidebarOpen.value ? "true" : "false"}
                  onClick={() => (sidebarOpen.value = !sidebarOpen.value)}
                >
                  <span class="sidebar-toggle-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span class="sidebar-toggle-label">Menu</span>
                </button>
                <p class="content-kicker">Sinwan docs</p>
                <h1 class="content-title">
                  A fast reactive UI library for JSX, fine-grained reactivity,
                  SSR, and hydration.
                </h1>
              </div>
              <ThemeToggle />
            </header>
            <DocViewer />
          </section>
        </main>
      </div>
    );
  },
);

const ThemeToggle = createComponent(() => {
  const theme = inject(ThemeKey)!;
  return (
    <button
      class="theme-toggle"
      aria-label="Toggle color theme"
      onClick={() => (theme.value = theme.value === "dark" ? "light" : "dark")}
    >
      <span class="theme-toggle-icon">
        {() => (theme.value === "dark" ? "☀" : "☾")}
      </span>
      <span class="theme-toggle-label">
        {() => (theme.value === "dark" ? "Light" : "Dark")}
      </span>
    </button>
  );
});
