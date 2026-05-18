import { createComponent, inject, For } from "sinwan";
import { CurrentPageKey, SidebarOpenKey } from "../App";

const DOCS = [
  { id: "00-philosophy.md", title: "Philosophy" },
  { id: "01-getting-started.md", title: "Getting Started" },
  { id: "02-architecture.md", title: "Architecture" },
  { id: "03-reactivity.md", title: "Reactivity" },
  { id: "04-components.md", title: "Components" },
  { id: "05-lifecycle.md", title: "Lifecycle" },
  { id: "06-provide-inject.md", title: "Provide / Inject" },
  { id: "07-jsx.md", title: "JSX" },
  { id: "08-renderer.md", title: "Renderer" },
  { id: "09-ssr.md", title: "SSR" },
  { id: "10-hydration.md", title: "Hydration" },
  { id: "11-escaping.md", title: "Escaping" },
  { id: "12-runtime-compat.md", title: "Runtime Compatibility" },
  { id: "13-build-and-deploy.md", title: "Build & Deploy" },
  { id: "14-recipes.md", title: "Recipes" },
  { id: "15-api-reference.md", title: "API Reference" },
  { id: "16-types.md", title: "Types" },
  { id: "17-troubleshooting.md", title: "Troubleshooting" },
  { id: "18-react-interop.md", title: "React Interop (SHARED)" },
  { id: "19-react-hooks.md", title: "React Hooks" },
  { id: "20-react-components.md", title: "React Components" },
  { id: "21-react-server-apis.md", title: "React Server APIs" },
  { id: "22-react-static-apis.md", title: "React Static APIs" },
  { id: "23-react-unstable.md", title: "React Unstable APIs" },
  { id: "24-state-getters.md", title: "State Getters" },
  { id: "CHANGELOG.md", title: "Changelog" },
];

export const Sidebar = createComponent(() => {
  const currentPage = inject(CurrentPageKey)!;
  const sidebarOpen = inject(SidebarOpenKey)!;

  return (
    <aside class={() => `sidebar ${sidebarOpen.value ? "is-open" : ""}`}>
      <div class="sidebar-header">
        <img
          class="sidebar-logo-img"
          src="https://avatars.githubusercontent.com/u/252437356?s=400&v=4"
          alt="Sinwan Logo"
          width="40"
          height="40"
        />
        <div class="sidebar-header-text">
          <div class="logo">Sinwan</div>
        </div>
        <span class="version-pill">v1.1.2</span>
      </div>
      <p class="sidebar-description">
        A compact guide to the runtime, renderer, and data flow behind Sinwan.
      </p>
      <nav>
        <div class="sidebar-section-label">Contents</div>
        <ul class="nav-list">
          <For each={DOCS}>
            {(doc) => (
              <li class="nav-item">
                <a
                  href={`#${doc.id}`}
                  class={() =>
                    `nav-link ${currentPage.value === doc.id ? "active" : ""}`
                  }
                  onClick={() => {
                    currentPage.value = doc.id;
                    sidebarOpen.value = false;
                  }}
                >
                  {doc.title}
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </aside>
  );
});
