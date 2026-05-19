import { mount } from "sinwan/renderer";
import { App } from "./App";
import { AsyncHooksDemo } from "./components/AsyncHooksDemo";
import { UseEffectTimeoutDemo } from "./components/UseEffectTimeoutDemo";
import { FormDemo } from "./components/FormDemo";

import.meta.hot.accept();

mount(FormDemo, document.getElementById("app")!);
