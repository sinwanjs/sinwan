import type { ESLint } from "eslint";
import stateGetterMustBeCalled from "./rules/state-getter-must-be-called";
import noStateGetterCallInJsx from "./rules/no-state-getter-call-in-jsx";

const plugin: ESLint.Plugin = {
  rules: {
    "state-getter-must-be-called": stateGetterMustBeCalled,
    "no-state-getter-call-in-jsx": noStateGetterCallInJsx,
  },
  configs: {
    recommended: {
      plugins: ["sinwan"],
      rules: {
        "sinwan/state-getter-must-be-called": "error",
        "sinwan/no-state-getter-call-in-jsx": "error",
      },
    },
  },
};

export = plugin;
