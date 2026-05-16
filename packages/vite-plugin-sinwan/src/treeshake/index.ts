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

import {
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from "node:fs";
import path from "node:path";
import { scanFile, mergeResults, type DetectionResult } from "./detector";
import { resolveTransitiveDependencies } from "./dependency-graph";
import { filterAstByUsedExports } from "./ast-filter";

export interface SinwanVitePlugin {
  name: string;
  enforce?: "pre" | "post";
  configResolved?: (config: any) => void;
  buildStart?: () => void;
  transform?: (
    code: string,
    id: string,
  ) => { code: string; map?: any } | null | void;
  generateBundle?: (
    outputOptions: any,
    bundle: Record<string, any>,
    isWrite: boolean,
  ) => void;
}

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
  forceKeep: ["_$createTemplate"],
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

function normalizeId(id: string): string {
  return id.split("?")[0]!.replace(/\\/g, "/");
}

function normalizePath(id: string): string {
  return id.replace(/\\/g, "/");
}

function matchesAnyPath(
  id: string,
  patterns: string[],
  root?: string,
): boolean {
  const normalized = normalizePath(id);
  const relative = root
    ? normalizePath(path.relative(root, normalized))
    : normalized;
  return patterns.some(
    (pattern) =>
      matchesGlob(normalized, pattern) || matchesGlob(relative, pattern),
  );
}

function isSinwanEntryModule(id: string): boolean {
  return /\/dist\/(?:esm|cjs)\/index\.(?:production|development)(?:\.min)?\.js$/.test(
    normalizeId(id),
  );
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
export function sinwanTreeShake(
  options: TreeShakeOptions = {},
): SinwanVitePlugin {
  const opts = { ...defaults, ...options };
  const includePatterns = Array.isArray(opts.include)
    ? opts.include
    : [opts.include];
  const excludePatterns = Array.isArray(opts.exclude)
    ? opts.exclude
    : [opts.exclude];

  const detectionResults: DetectionResult[] = [];
  const scannedIds = new Set<string>();
  let projectRoot = normalizePath(process.cwd());
  let preScanned = false;
  let preOptimizedCount = 0;
  let scannedFiles = 0;
  let skippedFiles = 0;

  const shouldScanFile = (id: string): boolean => {
    const normalized = normalizeId(id);
    const isIncluded = matchesAnyPath(
      normalized,
      includePatterns,
      projectRoot,
    );
    const isExcluded = matchesAnyPath(
      normalized,
      excludePatterns,
      projectRoot,
    );
    return isIncluded && !isExcluded;
  };

  const recordScan = (code: string, id: string): void => {
    const normalized = normalizeId(id);
    if (scannedIds.has(normalized)) return;

    if (!shouldScanFile(normalized)) {
      skippedFiles++;
      return;
    }

    scannedIds.add(normalized);
    scannedFiles++;
    detectionResults.push(scanFile(code, normalized));
  };

  const walkProjectFiles = (dir: string): string[] => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const normalized = normalizePath(fullPath);

      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === ".git"
        ) {
          continue;
        }
        if (!matchesAnyPath(normalized, excludePatterns, projectRoot)) {
          files.push(...walkProjectFiles(fullPath));
        }
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          if (statSync(fullPath).isDirectory()) continue;
        } catch {
          continue;
        }
      }

      files.push(fullPath);
    }

    return files;
  };

  const preScanProject = (): void => {
    if (preScanned) return;
    preScanned = true;

    for (const file of walkProjectFiles(projectRoot)) {
      const normalized = normalizePath(file);
      if (!shouldScanFile(normalized)) continue;

      try {
        recordScan(readFileSync(file, "utf8"), normalized);
      } catch {
        skippedFiles++;
      }
    }
  };

  const currentNeededBindings = (): {
    used: Set<string>;
    needed: Set<string>;
  } => {
    const merged = mergeResults(detectionResults);
    const used = new Set(merged.allUsedIdentifiers);

    if (opts.forceKeep) {
      for (const name of opts.forceKeep) used.add(name);
    }

    return { used, needed: resolveTransitiveDependencies(used) };
  };

  const filterSinwanEntryModule = (
    code: string,
    id: string,
  ): { code: string; map: null } | null => {
    if (!opts.rewriteBundle || !isSinwanEntryModule(id)) return null;

    preScanProject();

    const { used, needed } = currentNeededBindings();
    if (used.size === 0) return null;

    try {
      const originalSize = code.length;
      const filterResult = filterAstByUsedExports(code, needed);
      if (filterResult.keptExports.length === 0) return null;

      preOptimizedCount++;

      if (opts.verbose) {
        const newSize = filterResult.code.length;
        const reduction = originalSize - newSize;
        const pct =
          originalSize > 0
            ? ((reduction / originalSize) * 100).toFixed(1)
            : "0.0";
        console.log(
          `[sinwan-tree-shake] Optimized module before Rollup: ${id.replace(/.*\/dist\//, "dist/")}`,
        );
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

      return { code: filterResult.code, map: null };
    } catch (err) {
      console.warn(
        `[sinwan-tree-shake] Failed to optimise module ${id}:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  };

  return {
    name: "vite-plugin-sinwan-treeshake",
    enforce: "post",

    configResolved(config: any) {
      projectRoot = normalizePath(config.root ?? process.cwd());
    },

    buildStart() {
      preScanProject();
    },

    transform(code: string, id: string) {
      const filtered = filterSinwanEntryModule(code, id);
      if (filtered) return filtered;

      recordScan(code, id);
      return null;
    },

    generateBundle(_outputOptions, bundle) {
      const merged = mergeResults(detectionResults);
      const { needed } = currentNeededBindings();

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
        if (preOptimizedCount > 0) {
          console.log(
            `[sinwan-tree-shake] Pre-optimized ${preOptimizedCount} Sinwan module(s) before Rollup`,
          );
        }
      }

      if (merged.allUsedIdentifiers.size === 0) {
        if (opts.verbose) {
          console.warn(
            `[sinwan-tree-shake] No Sinwan usage detected — skipping tree-shaking.`,
          );
        }
        return;
      }

      if (preOptimizedCount > 0) {
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

      let matchedCount = 0;
      let rewrittenCount = 0;
      for (const chunkName in bundle) {
        const chunk = bundle[chunkName];
        if (!chunk || chunk.type !== "chunk") continue;
        if (!isSinwanChunk(chunk, opts.sinwanChunkPattern!)) continue;
        matchedCount++;

        const originalCode: string = chunk.code;
        const originalSize = originalCode.length;

        try {
          const filterResult = filterAstByUsedExports(originalCode, needed);

          // Rollup may name a shared internal chunk after the Sinwan entry
          // file while exporting minified private symbols. If no public
          // Sinwan export survives, replacing that chunk would break the
          // generated import graph after Rollup has already validated it.
          if (filterResult.keptExports.length === 0) {
            if (opts.verbose) {
              console.log(
                `[sinwan-tree-shake] Skipped chunk ${chunkName}: no matching public Sinwan exports`,
              );
            }
            continue;
          }

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
          matchedCount === 0
            ? `[sinwan-tree-shake] No Sinwan chunk found matching pattern ${opts.sinwanChunkPattern}`
            : `[sinwan-tree-shake] No Sinwan chunks were rewritten`,
        );
      }
    },
  };
}
