import { mount } from "sinwan/renderer";
import { App } from "./App";
import { AsyncHooksDemo } from "./components/AsyncHooksDemo";
import { UseEffectTimeoutDemo } from "./components/UseEffectTimeoutDemo";

import.meta.hot.accept();

mount(UseEffectTimeoutDemo, document.getElementById("app")!);
