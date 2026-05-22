import { cc, Show, Key } from "sinwan/component";
import { signal, computed, effect } from "sinwan/reactivity";
import type { SinwanComponent } from "sinwan/component";

// ─── Types ──────────────────────────────────────────────

export type LazyComponent<P extends object = {}> = () => Promise<{
  default: SinwanComponent<P>;
}>;

export interface Route {
  path: string;
  component: SinwanComponent<any> | LazyComponent<any>;
  loader?: () => Promise<any>;
}

// ─── State ──────────────────────────────────────────────

const currentPath = signal<string>(
  typeof window !== "undefined" ? window.location.pathname : "/",
);

const routes = signal<Route[]>([]);
const isLoading = signal<boolean>(false);
const routeError = signal<string | null>(null);

// Cache for lazy-loaded components + prefetched data
const componentCache = new Map<string, SinwanComponent<any>>();
const prefetchCache = new Map<string, Promise<any>>();

// ─── Helpers ────────────────────────────────────────────

function matchPath(path: string, routePath: string): boolean {
  if (routePath === path) return true;
  const pattern = routePath.replace(/:\w+/g, "[^/]+");
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(path);
}

function findRoute(path: string): Route | undefined {
  return routes.value.find((r) => matchPath(path, r.path));
}

function isLazyComponent(
  comp: SinwanComponent<any> | LazyComponent<any>,
): comp is LazyComponent<any> {
  return typeof comp === "function" && !(comp as any)._SinwanComponent;
}

// ─── Route registry ─────────────────────────────────────

export function defineRoutes(routeList: Route[]) {
  routes.value = routeList;
}

// Match current path to a route
const matchedRoute = computed(() => {
  const path = currentPath.value;
  return findRoute(path);
});

// ─── Navigation ─────────────────────────────────────────

export function navigate(to: string, pushState = true) {
  if (typeof window === "undefined") return;
  if (pushState) {
    window.history.pushState({}, "", to);
  }
  currentPath.value = to;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    currentPath.value = window.location.pathname;
  });
}

export function setInitialPath(path: string) {
  currentPath.value = path;
}

// ─── Prefetching ────────────────────────────────────────

export function prefetchRoute(path: string): void {
  if (typeof window === "undefined") return;

  const r = findRoute(path);
  if (!r) return;

  // Prefetch lazy component
  if (isLazyComponent(r.component) && !componentCache.has(path)) {
    r.component().then((mod) => {
      if (!componentCache.has(path)) {
        componentCache.set(path, mod.default);
      }
    });
  }

  // Prefetch loader data
  if (r.loader && !prefetchCache.has(path)) {
    prefetchCache.set(path, r.loader());
  }
}

export function getPrefetchedData(path: string): any | undefined {
  const promise = prefetchCache.get(path);
  // If already resolved, the consumer awaits it; otherwise undefined
  return undefined;
}

// ─── lazy() helper ──────────────────────────────────────

export function lazy<P extends object>(
  loader: () => Promise<{ default: SinwanComponent<P> }>,
): LazyComponent<P> {
  return loader;
}

// ─── Link component with prefetch ───────────────────────

export const Link = cc<{
  href: string;
  children: any;
  prefetch?: boolean;
}>(({ href, children, prefetch = true }) => {
  return (
    <a
      href={href}
      onClick={(e: MouseEvent) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        navigate(href);
      }}
      onMouseEnter={() => {
        if (prefetch) {
          prefetchRoute(href);
        }
      }}
    >
      {children}
    </a>
  );
});

// ─── RouterOutlet with Suspense + lazy loading ──────────

export const RouterOutlet = cc<{
  initialData?: any;
  fallback?: any;
}>(({ initialData, fallback }) => {
  const data = signal<any>(initialData ?? null);
  const resolvedComponent = signal<SinwanComponent<any> | null>(null);

  // Track previous path to avoid duplicate work
  let lastPath: string | null = null;

  if (typeof window !== "undefined") {
    effect(() => {
      const r = matchedRoute.value;
      const path = currentPath.value;

      if (!r || lastPath === path) return;
      lastPath = path;

      routeError.value = null;
      isLoading.value = true;

      const loadComponent = async () => {
        let Comp: SinwanComponent<any>;

        if (isLazyComponent(r.component)) {
          // Check cache first
          const cached = componentCache.get(r.path);
          if (cached) {
            Comp = cached;
          } else {
            const mod = await r.component();
            Comp = mod.default;
            componentCache.set(r.path, Comp);
          }
        } else {
          Comp = r.component;
        }

        resolvedComponent.value = Comp;
      };

      const loadData = async () => {
        if (!r.loader) {
          data.value = null;
          return;
        }

        // Use prefetched data if available
        const prefetched = prefetchCache.get(r.path);
        try {
          const result = prefetched ? await prefetched : await r.loader();
          data.value = result;
        } catch (e: any) {
          console.error("Loader error:", e);
          routeError.value = e.message || "Failed to load data";
        }
      };

      Promise.all([loadComponent(), loadData()])
        .then(() => {
          isLoading.value = false;
        })
        .catch((e: any) => {
          console.error("Route load error:", e);
          routeError.value = e.message || "Failed to load route";
          isLoading.value = false;
        });
    });
  }

  const defaultFallback = (
    <div style="padding: 20px; text-align: center;">
      <p>Loading...</p>
    </div>
  );

  return (
    <div class="router-outlet">
      <Show when={() => routeError.value}>
        <div style="padding: 20px; color: #e74c3c; border: 1px solid #e74c3c; border-radius: 4px;">
          <strong>Error:</strong> {routeError.value}
        </div>
      </Show>

      <Show when={() => !routeError.value}>
        <Show
          when={() => !isLoading.value}
          fallback={fallback ?? defaultFallback}
        >
          <Key when={currentPath} cache={false}>
            {() => {
              const r = matchedRoute.value;
              if (!r) return <div>404 - Page not found</div>;

              const Comp = resolvedComponent.value ?? r.component;
              if (!Comp || isLazyComponent(Comp)) {
                return <div>Loading component...</div>;
              }

              return <Comp routeData={data} {...(data.value || {})} />;
            }}
          </Key>
        </Show>
      </Show>
    </div>
  );
});
