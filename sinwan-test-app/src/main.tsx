import { mount } from "sinwan/renderer";
import { App } from "./App";

import.meta.hot.accept();
mount(App, document.getElementById("app")!);
