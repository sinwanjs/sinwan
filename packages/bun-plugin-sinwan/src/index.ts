import { transformJSX } from "./compiler/transform";

export interface SinwanBunOptions {
  /** Enable template hoisting (default: true) */
  hoist?: boolean;
  /** JSX configuration for automatic runtime */
  jsx?: {
    runtime?: "automatic" | "classic";
    importSource?: string;
  };
}

const DEFAULT_OPTIONS: Required<Pick<SinwanBunOptions, "hoist">> &
  Pick<SinwanBunOptions, "jsx"> = {
  hoist: true,
  jsx: {
    runtime: "automatic",
    importSource: "sinwan",
  },
};

/**
 * Sinwan Bun plugin.
 *
 * Provides JSX transformation (hoisting) using Bun's native plugin API.
 * Note: treeShake option is ignored for Bun builds as Bun.build has native
 * tree-shaking. Use the Vite plugin if you need custom Sinwan tree-shaking.
 */
export function sinwan(options: SinwanBunOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    name: "sinwan",
    setup(build: any) {
      // Configure JSX settings with defaults
      build.config = {
        ...build.config,
        jsx: opts.jsx,
      };

      // Bun's onLoad handles JSX transformation
      build.onLoad({ filter: /\.[tj]sx$/ }, async (args: { path: string }) => {
        const code = await (globalThis as any).Bun.file(args.path).text();

        // JSX compilation with hoisting
        const transformed = transformJSX(code, args.path, {
          hoist: opts.hoist,
        });

        return {
          contents: transformed.code,
          loader: args.path.endsWith("x") ? "tsx" : "ts",
        };
      });
    },
  };
}

export { transformJSX };
