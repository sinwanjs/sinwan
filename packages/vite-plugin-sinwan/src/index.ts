import { transformJSX } from "./compiler/transform";
import { sinwanTreeShake } from "./treeshake";
import type { SinwanVitePlugin, TreeShakeOptions } from "./treeshake";

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
export function sinwan(options: SinwanOptions = {}): SinwanVitePlugin {
  const opts = { ...DEFAULT_SINWAN_OPTIONS, ...options };
  const enableTreeShake = opts.treeShake !== false;

  // Compose the standalone tree-shake plugin so we don't duplicate logic.
  const tsPlugin = enableTreeShake
    ? sinwanTreeShake(typeof opts.treeShake === "object" ? opts.treeShake : {})
    : null;

  return {
    name: "sinwan",
    enforce: "pre",

    configResolved(config: any) {
      if (tsPlugin) {
        const hook = tsPlugin.configResolved;
        if (typeof hook === "function") {
          hook(config);
        }
      }
    },

    buildStart() {
      if (tsPlugin) {
        const hook = tsPlugin.buildStart;
        if (typeof hook === "function") {
          hook();
        }
      }
    },

    transform(code: string, id: string) {
      // JSX compilation runs first so the scanner can see compile-time
      // helpers such as _$createTemplate in transformed source.
      let jsxResult: { code: string; map?: any } | null = null;
      if (/\.[tj]sx$/.test(id)) {
        jsxResult = transformJSX(code, id, { hoist: opts.hoist });
      }

      // Delegate usage detection to the standalone tree-shake plugin.
      // Bundle pruning happens later in generateBundle, after every user
      // module has had a chance to contribute its Sinwan imports/usages.
      let tsResult: { code: string; map?: any } | null | void = null;
      if (tsPlugin) {
        const hook = tsPlugin.transform;
        const codeToScan = jsxResult ? jsxResult.code : code;
        if (typeof hook === "function") {
          tsResult = hook(codeToScan, id);
        } else if (hook && typeof (hook as any).handler === "function") {
          tsResult = (hook as any).handler(codeToScan, id);
        }
      }

      return tsResult ?? jsxResult;
    },

    generateBundle(outputOptions, bundle, isWrite) {
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

/**
 * Sinwan Bun plugin.
 *
 * Provides the same JSX transformation (hoisting) as the Vite plugin,
 * but using Bun's native plugin API.
 */
export function sinwanBun(options: SinwanOptions = {}): any {
  const opts = { ...DEFAULT_SINWAN_OPTIONS, ...options };
  const enableTreeShake = opts.treeShake !== false;
  
  const tsPlugin = enableTreeShake
    ? sinwanTreeShake(typeof opts.treeShake === "object" ? opts.treeShake : {})
    : null;

  return {
    name: "sinwan",
    setup(build: any) {
      // Bun's onLoad is the equivalent of Vite's transform hook.
      build.onLoad({ filter: /\.[tj]sx$/ }, async (args: { path: string }) => {
        const code = await (globalThis as any).Bun.file(args.path).text();
        
        // 1. JSX compilation (hoisting)
        let transformed = transformJSX(code, args.path, { hoist: opts.hoist });
        
        // 2. Tree-shaking usage detection (if enabled)
        if (tsPlugin) {
          const hook = tsPlugin.transform;
          const codeToScan = transformed.code;
          let tsResult: any = null;
          
          if (typeof hook === "function") {
            tsResult = (hook as any)(codeToScan, args.path);
          } else if (hook && typeof (hook as any).handler === "function") {
            tsResult = (hook as any).handler(codeToScan, args.path);
          }
          
          if (tsResult) {
            transformed = typeof tsResult === 'string' ? { code: tsResult } : tsResult;
          }
        }

        return {
          contents: transformed.code,
          loader: args.path.endsWith("x") ? "tsx" : "ts",
        };
      });
    },
  };
}

export { transformJSX };
