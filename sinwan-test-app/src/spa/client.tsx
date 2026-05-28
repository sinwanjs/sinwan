import { hydrate, getSinwanData } from "sinwan/hydration";
import { App } from "./App.tsx";

const sinwanData = getSinwanData();
const initialPath = sinwanData.path || window.location.pathname;

const container = document.getElementById("app");
if (!container) {
  throw new Error("Container not found");
}
hydrate(App, container, { initialPath });
console.log("✅ App hydrated at path:", initialPath);
