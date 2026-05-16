/**
 * Sinwan AST Filter
 *
 * Uses Babel to parse a bundled (or unbundled) Sinwan module,
 * build an internal dependency graph between top-level bindings,
 * and remove all declarations / exports that are not reachable
 * from the set of explicitly-used exports.
 */

import { parse } from "@babel/parser";
import _generate from "@babel/generator";
const generate =
  typeof _generate === "function"
    ? _generate
    : ((_generate as any).default ?? _generate);
import _traverse from "@babel/traverse";
const traverse =
  typeof _traverse === "function"
    ? _traverse
    : ((_traverse as any).default ?? _traverse);
import * as t from "@babel/types";

/** A binding in the module: its name and the AST node that declares it */
interface Binding {
  name: string;
  node: t.Node;
  parentPath?: t.Node;
}

/** Result of the filtering operation */
export interface FilterResult {
  code: string;
  keptExports: string[];
  removedExports: string[];
  keptBindings: string[];
  removedBindings: string[];
}

/**
 * Parse source code and build a map of all top-level bindings.
 *
 * @param code - Source code string.
 * @returns Parsed AST and binding map.
 */
function parseModule(code: string): {
  ast: t.File;
  bindings: Map<string, Binding>;
} {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const bindings = new Map<string, Binding>();

  for (const stmt of ast.program.body) {
    // function Show() {}
    if (t.isFunctionDeclaration(stmt) && stmt.id) {
      bindings.set(stmt.id.name, { name: stmt.id.name, node: stmt });
      continue;
    }

    // const Show = ..., let X = ..., var Y = ...
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isIdentifier(decl.id)) {
          bindings.set(decl.id.name, {
            name: decl.id.name,
            node: decl,
            parentPath: stmt,
          });
        }
      }
      continue;
    }

    // class Foo {}
    if (t.isClassDeclaration(stmt) && stmt.id) {
      bindings.set(stmt.id.name, { name: stmt.id.name, node: stmt });
      continue;
    }

    // export function Show() {}
    // export const Show = ...
    // export class Show {}
    if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
      const decl = stmt.declaration;
      if (t.isFunctionDeclaration(decl) && decl.id) {
        bindings.set(decl.id.name, { name: decl.id.name, node: stmt });
      } else if (t.isVariableDeclaration(decl)) {
        for (const d of decl.declarations) {
          if (t.isIdentifier(d.id)) {
            bindings.set(d.id.name, {
              name: d.id.name,
              node: d,
              parentPath: stmt,
            });
          }
        }
      } else if (t.isClassDeclaration(decl) && decl.id) {
        bindings.set(decl.id.name, { name: decl.id.name, node: stmt });
      }
      continue;
    }
  }

  return { ast, bindings };
}

/**
 * Given an AST node, collect all free identifier references inside it.
 * This ignores identifiers that are locally bound (parameters, inner vars).
 */
function collectReferences(node: t.Node): Set<string> {
  const refs = new Set<string>();
  const localBindings = new Set<string>();

  traverse(node, {
    noScope: true,
    // Track local bindings to avoid counting them as references
    FunctionDeclaration(path: any) {
      if (path.node.id) localBindings.add(path.node.id.name);
      for (const p of path.node.params) {
        extractBindingsFromPattern(p, localBindings);
      }
    },
    FunctionExpression(path: any) {
      if (path.node.id) localBindings.add(path.node.id.name);
      for (const p of path.node.params) {
        extractBindingsFromPattern(p, localBindings);
      }
    },
    ArrowFunctionExpression(path: any) {
      for (const p of path.node.params) {
        extractBindingsFromPattern(p, localBindings);
      }
    },
    VariableDeclarator(path: any) {
      extractBindingsFromPattern(path.node.id, localBindings);
    },
    ClassDeclaration(path: any) {
      if (path.node.id) localBindings.add(path.node.id.name);
    },
    CatchClause(path: any) {
      if (t.isIdentifier(path.node.param)) {
        localBindings.add(path.node.param.name);
      }
    },

    // Collect references
    Identifier(path: any) {
      // Avoid the identifier being the declaration site itself
      if (t.isVariableDeclarator(path.parent) && path.parent.id === path.node) {
        return;
      }
      if (
        t.isFunctionDeclaration(path.parent) &&
        path.parent.id === path.node
      ) {
        return;
      }
      if (t.isClassDeclaration(path.parent) && path.parent.id === path.node) {
        return;
      }
      if (
        t.isObjectProperty(path.parent) &&
        path.parent.key === path.node &&
        !path.parent.computed
      ) {
        return;
      }
      if (
        t.isMemberExpression(path.parent) &&
        path.parent.property === path.node &&
        !path.parent.computed
      ) {
        return;
      }
      if (t.isExportSpecifier(path.parent) && path.parent.local === path.node) {
        return;
      }

      if (!localBindings.has(path.node.name)) {
        refs.add(path.node.name);
      }
    },
  });

  return refs;
}

/**
 * Recursively extract binding names from a destructuring pattern.
 */
function extractBindingsFromPattern(
  pattern: t.Node,
  bindings: Set<string>,
): void {
  if (t.isIdentifier(pattern)) {
    bindings.add(pattern.name);
  } else if (t.isObjectPattern(pattern)) {
    for (const prop of pattern.properties) {
      if (t.isRestElement(prop)) {
        extractBindingsFromPattern(prop.argument, bindings);
      } else if (t.isObjectProperty(prop) && !prop.computed) {
        extractBindingsFromPattern(prop.value, bindings);
      }
    }
  } else if (t.isArrayPattern(pattern)) {
    for (const el of pattern.elements) {
      if (el) extractBindingsFromPattern(el, bindings);
    }
  } else if (t.isRestElement(pattern)) {
    extractBindingsFromPattern(pattern.argument, bindings);
  } else if (t.isAssignmentPattern(pattern)) {
    extractBindingsFromPattern(pattern.left, bindings);
  }
}

/**
 * Build a map: bindingName -> Set<referencedBindingName>
 */
function buildReferenceGraph(
  bindings: Map<string, Binding>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const [name, binding] of bindings) {
    const refs = collectReferences(binding.node);
    const localRefs = new Set<string>();
    for (const ref of refs) {
      if (bindings.has(ref)) {
        localRefs.add(ref);
      }
    }
    graph.set(name, localRefs);
  }

  return graph;
}

/**
 * Compute the transitive closure of bindings starting from entry points.
 */
function computeReachable(
  entries: Set<string>,
  graph: Map<string, Set<string>>,
): Set<string> {
  const reachable = new Set<string>();
  const stack = [...entries];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    const deps = graph.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!reachable.has(dep)) {
          stack.push(dep);
        }
      }
    }
  }

  return reachable;
}

/**
 * Extract the local binding names for a set of public export names.
 *
 * Handles two forms:
 *   export function Show() {}  // local == public
 *   export { local as Show }   // local mapped to public
 */
function resolveExportBindings(
  ast: t.File,
  publicExportNames: Set<string>,
): Set<string> {
  const localBindings = new Set<string>();

  for (const stmt of ast.program.body) {
    // export function Show() {}  => local name is Show
    if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
      const decl = stmt.declaration;
      if (t.isFunctionDeclaration(decl) && decl.id) {
        if (publicExportNames.has(decl.id.name)) {
          localBindings.add(decl.id.name);
        }
      } else if (t.isClassDeclaration(decl) && decl.id) {
        if (publicExportNames.has(decl.id.name)) {
          localBindings.add(decl.id.name);
        }
      } else if (t.isVariableDeclaration(decl)) {
        for (const d of decl.declarations) {
          if (t.isIdentifier(d.id) && publicExportNames.has(d.id.name)) {
            localBindings.add(d.id.name);
          }
        }
      }
      continue;
    }

    // export { local as Show }
    if (t.isExportNamedDeclaration(stmt) && !stmt.declaration) {
      for (const spec of stmt.specifiers) {
        if (
          t.isExportSpecifier(spec) &&
          t.isIdentifier(spec.local) &&
          t.isIdentifier(spec.exported) &&
          publicExportNames.has(spec.exported.name)
        ) {
          localBindings.add(spec.local.name);
        }
      }
    }
  }

  return localBindings;
}

/**
 * Filter the AST to keep only the specified public exports and their
 * transitive internal dependencies.
 *
 * @param code - Full source code of the Sinwan module / bundle.
 * @param keepExports - Set of public export names to preserve.
 * @returns FilterResult with the new code and metadata.
 */
export function filterAstByUsedExports(
  code: string,
  keepExports: Set<string>,
): FilterResult {
  const { ast, bindings } = parseModule(code);
  const graph = buildReferenceGraph(bindings);

  // Determine which local bindings are entry points
  const entryBindings = resolveExportBindings(ast, keepExports);

  // If the chunk has no recognizable ES-module exports, it is likely a
  // pre-minified bundle.  Bail out to avoid stripping the entire runtime.
  if (entryBindings.size === 0) {
    return {
      code,
      keptExports: [],
      removedExports: [],
      keptBindings: [],
      removedBindings: [],
    };
  }

  // Compute all reachable bindings
  const reachable = computeReachable(entryBindings, graph);

  // Determine which exports are kept vs removed
  const keptExports: string[] = [];
  const removedExports: string[] = [];

  for (const stmt of ast.program.body) {
    if (t.isExportNamedDeclaration(stmt) && !stmt.declaration) {
      const keptSpecs: t.ExportSpecifier[] = [];
      const removedSpecs: t.ExportSpecifier[] = [];

      for (const spec of stmt.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.local)) {
          const exportName = t.isIdentifier(spec.exported)
            ? spec.exported.name
            : (spec.exported as any).value;

          if (reachable.has(spec.local.name) && keepExports.has(exportName)) {
            keptSpecs.push(spec);
          } else {
            removedSpecs.push(spec);
          }
        }
      }

      for (const spec of keptSpecs) {
        const exportName = t.isIdentifier(spec.exported)
          ? spec.exported.name
          : (spec.exported as any).value;
        keptExports.push(exportName);
      }
      for (const spec of removedSpecs) {
        const exportName = t.isIdentifier(spec.exported)
          ? spec.exported.name
          : (spec.exported as any).value;
        removedExports.push(exportName);
      }

      // Replace the export declaration with only kept specifiers
      if (keptSpecs.length === 0) {
        // Remove entire export statement, but preserve source if present
        const idx = ast.program.body.indexOf(stmt);
        if (idx >= 0) ast.program.body.splice(idx, 1);
      } else {
        stmt.specifiers = keptSpecs as any;
      }
    }
  }

  // Remove unreachable top-level declarations
  const keptBindingsList: string[] = [];
  const removedBindingsList: string[] = [];

  for (const [name, binding] of bindings) {
    if (reachable.has(name)) {
      keptBindingsList.push(name);
      continue;
    }

    removedBindingsList.push(name);

    // If the binding is part of a VariableDeclaration with multiple
    // declarators, remove only this declarator.
    if (binding.parentPath && t.isVariableDeclaration(binding.parentPath)) {
      const decl = binding.parentPath;
      const idx = decl.declarations.indexOf(
        binding.node as t.VariableDeclarator,
      );
      if (idx >= 0) {
        decl.declarations.splice(idx, 1);
        // If no declarators remain, remove the whole declaration
        if (decl.declarations.length === 0) {
          const stmtIdx = ast.program.body.indexOf(decl);
          if (stmtIdx >= 0) ast.program.body.splice(stmtIdx, 1);
        }
      }
    } else {
      // Otherwise remove the whole statement
      const stmtIdx = ast.program.body.indexOf(binding.node as t.Statement);
      if (stmtIdx >= 0) ast.program.body.splice(stmtIdx, 1);
    }
  }

  // Also remove orphaned import statements (if filtering a source file)
  // Imports that reference removed bindings can be dropped.
  const bindingSet = new Set(keptBindingsList);
  for (let i = ast.program.body.length - 1; i >= 0; i--) {
    const stmt = ast.program.body[i];
    if (t.isImportDeclaration(stmt)) {
      let hasKept = false;
      for (const spec of stmt.specifiers) {
        if (
          t.isImportSpecifier(spec) &&
          t.isIdentifier(spec.local) &&
          bindingSet.has(spec.local.name)
        ) {
          hasKept = true;
          break;
        }
        if (t.isImportDefaultSpecifier(spec)) {
          // Conservatively keep default imports
          hasKept = true;
          break;
        }
        if (t.isImportNamespaceSpecifier(spec)) {
          // Conservatively keep namespace imports
          hasKept = true;
          break;
        }
      }
      if (!hasKept) {
        ast.program.body.splice(i, 1);
      }
    }
  }

  const result = generate(ast, { compact: false });
  return {
    code: result.code,
    keptExports: keptExports,
    removedExports: removedExports,
    keptBindings: keptBindingsList,
    removedBindings: removedBindingsList,
  };
}
