import type { Plugin } from "vite";
import { transformJSX } from "./compiler/transform";
import { sinwanTreeShake } from "./treeshake";
import type { TreeShakeOptions } from "./treeshake";

/** Re-export for consumers that previously imported from this module */
export type { TreeShakeOptions as SinwanTreeShakeConfig };

export interface SinwanOptions {
  /** Enable template hoisting (default: true) */
  hoist?: boolean;
  /** Enable aggressive tree-shaking in production builds */
  treeShake?: boolean | TreeShakeOptions;
}

const DEFAULT_SINWAN_OPTIONS: Required<
  Pick<SinwanOptions, "hoist" | "treeShake">
> = {
  hoist: true,
  treeShake: false,
};

/**
 * Unified Sinwan Vite plugin.
 *
 * Handles JSX compilation (with optional template hoisting) and,
 * when `treeShake` is enabled, delegates post-bundle pruning to
 * the standalone `sinwanTreeShake` plugin.
 *
 * @example
 * ```ts
 * // JSX transform only (default)
 * sinwan()
 *
 * // JSX + tree-shaking
 * sinwan({ treeShake: true })
 *
 * // JSX + tree-shaking with custom config
 * sinwan({
 *   treeShake: { verbose: true, forceKeep: ["_$createTemplate"] }
 * })
 * ```
 */
export function sinwan(options: SinwanOptions = {}): Plugin {
  const opts = { ...DEFAULT_SINWAN_OPTIONS, ...options };
  const enableTreeShake = opts.treeShake !== false;

  // Compose the standalone tree-shake plugin so we don't duplicate logic.
  const tsPlugin = enableTreeShake
    ? sinwanTreeShake(typeof opts.treeShake === "object" ? opts.treeShake : {})
    : null;

  return {
    name: "sinwan",
    enforce: "pre",

    transform(code: string, id: string) {
      // Delegate scanning to the standalone tree-shake plugin first,
      // so it sees the original source for every file (including JSX).
      if (tsPlugin) {
        const hook = tsPlugin.transform;
        if (typeof hook === "function") {
          (hook as any)(code, id);
        } else if (hook && typeof (hook as any).handler === "function") {
          (hook as any).handler(code, id);
        }
      }

      // JSX compilation (always active)
      if (/\.[tj]sx$/.test(id)) {
        return transformJSX(code, id, { hoist: opts.hoist });
      }

      return null;
    },

    generateBundle(outputOptions, bundle, isWrite) {
      // Delegate bundle rewriting to the standalone tree-shake plugin
      if (tsPlugin) {
        const hook = tsPlugin.generateBundle;
        if (typeof hook === "function") {
          (hook as any)(outputOptions, bundle, isWrite);
        } else if (hook && typeof (hook as any).handler === "function") {
          (hook as any).handler(outputOptions, bundle, isWrite);
        }
      }
    },
  };
}

export { transformJSX };
