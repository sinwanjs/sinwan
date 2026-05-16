import type { Plugin } from "vite";
import { transformJSX } from "./compiler/transform.js";
export { sinwanTreeShake } from "./treeshake";
export type { TreeShakeOptions } from "./treeshake";

/**
 *
 * @returns
 */
export function sinwan(): Plugin {
  return {
    name: "sinwan",
    enforce: "pre",
    transform(code: string, id: string) {
      if (!/\.[tj]sx$/.test(id)) return;
      return transformJSX(code, id, { hoist: true });
    },
  };
}

export { transformJSX };
