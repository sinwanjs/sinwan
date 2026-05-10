import { mount } from "sinwan";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("#app element not found");

// Handle initial page from hash or default
const hash = window.location.hash.slice(1) || "00-philosophy.md";

// Mount the app - DocViewer will load the content
mount(App, root as Element, {
  initialPage: hash,
});
