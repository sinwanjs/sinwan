/**
 * Vite Plugin: sinwanTreeShake
 *
 * Analyses the project's source files to discover which Sinwan exports
 * are actually used, then prunes the Sinwan bundle chunk so only the
 * used exports (and their transitive internal dependencies) are shipped.
 *
 * Usage in `vite.config.ts`:
 *
 * ```ts
 * import { sinwanTreeShake } from "vite-plugin-sinwan";
 *
 * export default defineConfig({
 *   plugins: [
 *     sinwan(),
 *     sinwanTreeShake({ verbose: true }),
 *   ],
 * });
 * ```
 */

import type { Plugin } from "vite";
import { scanFile, mergeResults, type DetectionResult } from "./detector";
import {
  resolveTransitiveDependencies,
  resolveRequiredModules,
} from "./dependency-graph";
import { filterAstByUsedExports, type FilterResult } from "./ast-filter";

export interface TreeShakeOptions {
  /** File patterns to scan for Sinwan usage (default: all JS/TS/JSX/TSX) */
  include?: string | string[];
  /** File patterns to exclude from scanning */
  exclude?: string | string[];
  /** Print a summary report after bundling */
  verbose?: boolean;
  /**
   * When `true`, operate on the final bundled Sinwan chunk in
   * `generateBundle`.  When `false`, the plugin only reports what
   * *would* be tree-shaken without mutating the bundle.
   */
  rewriteBundle?: boolean;
  /**
   * Additional export names to force-keep (e.g. runtime internals
   * that are accessed dynamically or via string lookups).
   */
  forceKeep?: string[];
  /**
   * RegExp or string to identify Sinwan chunks in the bundle.
   * Default matches `sinwan` in the chunk file name or facadeModuleId.
   */
  sinwanChunkPattern?: RegExp | string;
}

/** Default options */
const defaults: Required<
  Omit<TreeShakeOptions, "forceKeep" | "sinwanChunkPattern">
> &
  Pick<TreeShakeOptions, "forceKeep" | "sinwanChunkPattern"> = {
  include: ["**/*.{js,jsx,ts,tsx}"],
  exclude: ["node_modules/**", "dist/**", "**/*.d.ts"],
  verbose: true,
  rewriteBundle: true,
  forceKeep: undefined,
  sinwanChunkPattern: /index\.(?:production|development)(?:\.min)?|sinwan/,
};

function isSinwanChunk(chunk: any, pattern: RegExp | string): boolean {
  if (chunk.type !== "chunk") return false;
  const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
  if (chunk.name && re.test(chunk.name)) return true;
  if (chunk.fileName && re.test(chunk.fileName)) return true;
  return false;
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports `**`, `*`, `?`, and brace expansion `{a,b,c}`.
 */
function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += ".";
      i++;
    } else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
        i++;
      } else {
        const inner = pattern.slice(i + 1, end);
        re +=
          "(?:" +
          inner
            .split(",")
            .map((s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|") +
          ")";
        i = end + 1;
      }
    } else if (/[.*+?^${}()|[\]\\]/.test(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp(re);
}

function matchesGlob(id: string, pattern: string): boolean {
  return globToRegex(pattern).test(id);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Create the tree-shaking Vite plugin.
 */
export function sinwanTreeShake(options: TreeShakeOptions = {}): Plugin {
  const opts = { ...defaults, ...options };
  const includePatterns = Array.isArray(opts.include)
    ? opts.include
    : [opts.include];
  const excludePatterns = Array.isArray(opts.exclude)
    ? opts.exclude
    : [opts.exclude];

  const detectionResults: DetectionResult[] = [];
  let scannedFiles = 0;
  let skippedFiles = 0;

  return {
    name: "vite-plugin-sinwan-treeshake",
    enforce: "post",

    transform(code: string, id: string) {
      // Skip non-user files
      const isIncluded = includePatterns.some((p) => matchesGlob(id, p));
      const isExcluded = excludePatterns.some((p) => matchesGlob(id, p));

      if (!isIncluded || isExcluded) {
        skippedFiles++;
        return null;
      }

      scannedFiles++;
      detectionResults.push(scanFile(code, id));
      return null;
    },

    generateBundle(_outputOptions, bundle) {
      const merged = mergeResults(detectionResults);
      let used = new Set(merged.allUsedIdentifiers);

      // Add force-kept exports
      if (opts.forceKeep) {
        for (const name of opts.forceKeep) used.add(name);
      }

      // Resolve transitive dependencies
      const needed = resolveTransitiveDependencies(used);

      if (opts.verbose) {
        console.log(
          `[sinwan-tree-shake] Scanned ${scannedFiles} files, skipped ${skippedFiles}`,
        );
        console.log(
          `[sinwan-tree-shake] Detected ${merged.allUsedIdentifiers.size} direct Sinwan identifiers`,
        );
        console.log(
          `[sinwan-tree-shake] Expanded to ${needed.size} bindings after dependency resolution`,
        );
      }

      // Safety guard: if no identifiers were detected, skip tree-shaking to
      // avoid accidentally stripping the entire Sinwan runtime.
      if (merged.allUsedIdentifiers.size === 0) {
        if (opts.verbose) {
          console.warn(
            `[sinwan-tree-shake] No Sinwan usage detected — skipping tree-shaking.`,
          );
        }
        return;
      }

      if (!opts.rewriteBundle) {
        if (opts.verbose) {
          console.log(
            `[sinwan-tree-shake] rewriteBundle=false — skipping bundle mutation`,
          );
        }
        return;
      }

      // Find and rewrite Sinwan chunks
      let rewrittenCount = 0;
      for (const chunkName in bundle) {
        const chunk = bundle[chunkName];
        if (!chunk || chunk.type !== "chunk") continue;
        if (!isSinwanChunk(chunk, opts.sinwanChunkPattern!)) continue;

        const originalCode: string = chunk.code;
        const originalSize = originalCode.length;

        try {
          const filterResult = filterAstByUsedExports(originalCode, needed);

          (chunk as any).code = filterResult.code;
          rewrittenCount++;

          if (opts.verbose) {
            const newSize = filterResult.code.length;
            const reduction = originalSize - newSize;
            const pct =
              originalSize > 0
                ? ((reduction / originalSize) * 100).toFixed(1)
                : "0.0";

            console.log(`[sinwan-tree-shake] Optimized chunk: ${chunkName}`);
            console.log(
              `  Original: ${formatBytes(originalSize)} → Optimized: ${formatBytes(newSize)} (-${pct}%)`,
            );
            console.log(
              `  Kept exports: ${filterResult.keptExports.length} | Removed exports: ${filterResult.removedExports.length}`,
            );
            console.log(
              `  Kept bindings: ${filterResult.keptBindings.length} | Removed bindings: ${filterResult.removedBindings.length}`,
            );
          }
        } catch (err) {
          console.warn(
            `[sinwan-tree-shake] Failed to optimise chunk ${chunkName}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      if (opts.verbose && rewrittenCount === 0) {
        console.log(
          `[sinwan-tree-shake] No Sinwan chunk found matching pattern ${opts.sinwanChunkPattern}`,
        );
      }
    },
  };
}
