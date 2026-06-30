import { cc } from "sinwan/component";
import { defineRoutes, RouterOutlet, setInitialPath } from "./Router.tsx";

// ═══════════════════════════════════════════
// Eagerly load all routes so SSR and hydration
// produce the same component tree.
// ═══════════════════════════════════════════

const homeMod = await import("./pages/Home.tsx");
const aboutMod = await import("./pages/About.tsx");
const counterMod = await import("./pages/CounterPage.tsx");
const countryMod = await import("./pages/Country.tsx");
const switchTest = await import("./pages/Switch.tsx");
const mutableDemoMod = await import("./pages/MutableDemo.tsx");
const reactDemoMod = await import("./pages/ReactDemo.tsx");

const HomeComp = homeMod.default;
const AboutComp = aboutMod.default;
const CounterComp = counterMod.default;
const CountryComp = countryMod.default;
const SwitchTestCom = switchTest.default;
const MutableDemoComp = mutableDemoMod.default;
const ReactDemoComp = reactDemoMod.default;

const routes = [
  { path: "/", component: HomeComp },
  { path: "/about", component: AboutComp },
  { path: "/counter", component: CounterComp },
  { path: "/country", component: CountryComp },
  { path: "/switch", component: SwitchTestCom },
  { path: "/mutable", component: MutableDemoComp },
  { path: "/react", component: ReactDemoComp },
];

defineRoutes(routes);

export const App = cc<{ initialPath?: string }>(({ initialPath }) => {
  if (initialPath) {
    setInitialPath(initialPath);
  }

  return (
    <div class="app">
      <RouterOutlet />
    </div>
  );
});
