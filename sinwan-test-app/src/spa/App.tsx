import { cc } from "sinwan/component";
import { defineRoutes, RouterOutlet, setInitialPath, lazy } from "./Router.tsx";

// ═══════════════════════════════════════════
// Hybrid lazy loading: eager on SSR, lazy on client
// ═══════════════════════════════════════════

const isServer = typeof window === "undefined";

let HomeComp: any, AboutComp: any, CounterComp: any, homeLoaderFn: any;

if (isServer) {
  const homeMod = await import("./pages/Home.tsx");
  HomeComp = homeMod.default;
  homeLoaderFn = homeMod.homeLoader;

  const aboutMod = await import("./pages/About.tsx");
  AboutComp = aboutMod.default;

  const counterMod = await import("./pages/CounterPage.tsx");
  CounterComp = counterMod.default;
} else {
  HomeComp = lazy(() => import("./pages/Home.tsx"));
  homeLoaderFn = async () => {
    const mod = await import("./pages/Home.tsx");
    return mod.homeLoader();
  };
  AboutComp = lazy(() => import("./pages/About.tsx"));
  CounterComp = lazy(() => import("./pages/CounterPage.tsx"));
}
console.log("tesjfjfjt");
const routes = [
  { path: "/", component: HomeComp, loader: homeLoaderFn },
  { path: "/about", component: AboutComp },
  { path: "/counter", component: CounterComp },
];

defineRoutes(routes);

export const App = cc<{ initialPath?: string; initialData?: any }>(
  ({ initialPath, initialData }) => {
    if (initialPath) {
      setInitialPath(initialPath);
    }

    return (
      <div class="app">
        <RouterOutlet
          initialData={initialData}
          fallback={
            <div style="padding: 40px; text-align: center;">
              <p style="font-size: 1.2rem; color: #666;">Loading page...</p>
            </div>
          }
        />
      </div>
    );
  },
);
