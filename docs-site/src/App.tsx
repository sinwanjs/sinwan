import {
  cc,
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
export const RawContentKey: InjectionKey<Signal<string>> =
  Symbol("raw-content");

export const App = createComponent(() => {
  // Get initial theme from localStorage or system preference
  const getInitialTheme = (): Theme => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const theme = signal<Theme>(getInitialTheme());
  const currentPage = signal(
    window.location.hash.slice(1) || "00-philosophy.md",
  );
  const sidebarOpen = signal(false);
  const rawContent = signal("");
  const copyLabel = signal("Copy");
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  provide(ThemeKey, theme);
  provide(CurrentPageKey, currentPage);
  provide(SidebarOpenKey, sidebarOpen);
  provide(RawContentKey, rawContent);

  onMounted(() => {
    const root = document.documentElement;
    const stop = theme.subscribe((t) => {
      root.setAttribute("data-theme", t);
      localStorage.setItem("theme", t);
    });
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

  const copyPageContent = async () => {
    const text = rawContent.value.trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      copyLabel.value = "Copied";
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (copyLabel.value = "Copy"), 1500);
    } catch {
      copyLabel.value = "Failed";
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => (copyLabel.value = "Copy"), 1500);
    }
  };

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
            <div class="content-header-left">
              <p class="content-kicker">Sinwan docs</p>
              <h1 class="content-title">
                A fast reactive UI library for JSX, fine-grained reactivity,
                SSR, and hydration.
              </h1>
            </div>
            <div class="content-header-center">
              <button
                class={() =>
                  `copy-button ${copyLabel.value === "Copied" ? "is-copied" : ""}`
                }
                type="button"
                onClick={copyPageContent}
                disabled={() => !rawContent.value}
                aria-label="Copy the current page content"
              >
                <span class="copy-button-icon" aria-hidden="true">
                  {() => (copyLabel.value === "Copied" ? "✓" : "⧉")}
                </span>
                {() => copyLabel.value}
              </button>
            </div>
            <div class="content-header-right">
              <ThemeToggle />
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
            </div>
          </header>
          <DocViewer />
        </section>
      </main>
    </div>
  );
});

const ThemeToggle = createComponent(() => {
  const theme = inject(ThemeKey)!;
  return (
    <button
      class="theme-toggle"
      aria-label="Toggle color theme"
      onClick={() => (theme.value = theme.value === "dark" ? "light" : "dark")}
    >
      <span class="theme-toggle-label theme-toggle-label-left"></span>
      <span class="theme-toggle-pill">
        <span class="theme-toggle-icon">
          {() => (theme.value === "dark" ? "☀" : "☾")}
        </span>
      </span>
      <span class="theme-toggle-label theme-toggle-label-right"></span>
    </button>
  );
});
