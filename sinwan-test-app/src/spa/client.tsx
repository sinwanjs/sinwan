import { hydrate } from "sinwan/hydration";
import { App } from "./App.tsx";

const initialPath =
  (window as any).__INITIAL_PATH__ || window.location.pathname;

const container = document.getElementById("app")!;
hydrate(App, container, { initialPath });
console.log("✅ App hydrated at path:", initialPath);
