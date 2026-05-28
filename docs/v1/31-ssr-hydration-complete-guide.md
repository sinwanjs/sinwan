# Guide Complet — App SSR + Hydration avec Sinwan & Bun

Ce guide montre, étape par étape, comment créer une application **SinwanJS** complète avec :

- **SSR** (Server-Side Rendering)
- **Hydration** côté client
- **Routing SPA** avec chargement de données
- **Build de production** via `Bun.build`
- **Serveur Bun.serve**

---

## Table des matières

1. [Structure du projet](#structure-du-projet)
2. [Installation](#installation)
3. [Créer le client (SPA)](#3-créer-le-client-spa)
4. [Créer le serveur SSR](#4-créer-le-serveur-ssr)
5. [Créer le routeur](#5-créer-le-routeur)
6. [Pages avec loader](#6-pages-avec-loader)
7. [Hydration côté client](#7-hydration-côté-client)
8. [Build de production](#8-build-de-production)
9. [Best Practices](#9-best-practices)

---

## Structure du projet

```
my-sinwan-app/
├── package.json
├── build.ts                 # Script de build production
├── tsconfig.json
├── src/
│   ├── client.tsx           # Point d'entrée client (hydration)
│   ├── server.ts            # Serveur Bun.serve + SSR
│   ├── App.tsx              # Composant racine
│   ├── index.css            # Styles globaux
│   ├── spa/
│   │   ├── Router.tsx       # Routeur SPA réactif
│   │   ├── App.tsx          # Wrapper SPA pour le routeur
│   │   └── pages/
│   │       ├── Home.tsx
│   │       ├── About.tsx
│   │       └── CounterPage.tsx
│   └── components/
│       └── Counter.tsx
```

---

## Installation

```bash
mkdir my-sinwan-app && cd my-sinwan-app
bun init -y
```

### package.json

```json
{
  "name": "my-sinwan-app",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/server.ts",
    "build": "bun run build.ts",
    "start": "NODE_ENV=production bun src/server.ts"
  },
  "dependencies": {
    "sinwan": "^0.x.x"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

```bash
bun install
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "sinwan",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun"]
  }
}
```

> **Important** : `jsxImportSource: "sinwan"` permet d'écrire du JSX sans import explicite de `h`.

---

## 3. Créer le client (SPA)

### src/client.tsx

Point d'entrée côté client. Récupère les données du serveur et hydrate l'application.

```tsx
import { hydrate } from "sinwan/hydration";
import { App } from "./spa/App.tsx";

const initialPath = (window as any).__INITIAL_PATH__ || "/";
const initialData = (window as any).__INITIAL_DATA__ || {};

hydrate(App, document.getElementById("app")!, {
  initialPath,
  initialData,
});
```

---

## 4. Créer le serveur SSR

### src/server.ts

Le serveur fait 3 choses :
1. **SSR** : rend chaque route en HTML
2. **API** : endpoints pour charger des données
3. **Client bundle** : sert le fichier client compilé

```ts
import { serve } from "bun";
import { renderToHydratableString } from "sinwan/react-server";
import { App } from "./spa/App.tsx";

// ═══════════════════════════════════════
// HTML SHELL
// ═══════════════════════════════════════

const shell = (content: string, initialPath: string, data: any) => `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Sinwan App</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app">${content}</div>
    <script>
      window.__INITIAL_PATH__ = ${JSON.stringify(initialPath)};
      window.__INITIAL_DATA__ = ${JSON.stringify(data)};
    </script>
    <script type="module" src="/client.js"></script>
  </body>
</html>
`;

// ═══════════════════════════════════════
// ROUTE DATA LOADERS
// ═══════════════════════════════════════

async function loadRouteData(path: string) {
  switch (path) {
    case "/":
      // Charger vos données ici (DB, API externe, etc.)
      return {
        databases: [
          { name: "users", sizeOnDisk: 1024 * 1024 * 45 },
          { name: "products", sizeOnDisk: 1024 * 1024 * 128 },
        ],
      };
    default:
      return {};
  }
}

// ═══════════════════════════════════════
// SSR RENDER
// ═══════════════════════════════════════

async function renderRoute(path: string) {
  const data = await loadRouteData(path);
  const html = await renderToHydratableString(App, {
    initialPath: path,
    initialData: data,
  });
  return { html, data };
}

// ═══════════════════════════════════════
// SERVEUR BUN
// ═══════════════════════════════════════

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // ── API Routes ──
  if (path === "/api/dbs") {
    const data = await loadRouteData("/");
    return Response.json(data);
  }

  // ── Client Bundle (dev : on build à la volée) ──
  if (path === "/client.js") {
    const result = await Bun.build({
      entrypoints: [import.meta.dir + "/client.tsx"],
      target: "browser",
      format: "esm",
      minify: process.env.NODE_ENV === "production",
    });
    if (!result.success) {
      return new Response("Build failed", { status: 500 });
    }
    return new Response(await result.outputs[0].text(), {
      headers: { "Content-Type": "application/javascript" },
    });
  }

  // ── Static files ──
  if (path.includes(".") && !path.endsWith(".tsx")) {
    return new Response("Not found", { status: 404 });
  }

  // ── SSR Catch-all ──
  const { html, data } = await renderRoute(path);
  return new Response(shell(html, path, data), {
    headers: { "Content-Type": "text/html" },
  });
}

const server = serve({
  port: 3000,
  fetch: handleRequest,
  development: process.env.NODE_ENV !== "production" ? {
    hmr: true,
    console: true,
  } : false,
});

console.log(`🚀 Server running at ${server.url}`);
```

---

## 5. Créer le routeur

### src/spa/Router.tsx

Routeur SPA réactif avec `signal`, `computed`, `effect`.

```tsx
import { cc, Key } from "sinwan/component";
import { signal, computed, effect } from "sinwan/reactivity";
import type { SinwanComponent } from "sinwan/component";

export interface Route {
  path: string;
  component: SinwanComponent<any>;
  loader?: () => Promise<any>;
}

// Signal global du chemin actuel
const currentPath = signal<string>(
  typeof window !== "undefined" ? window.location.pathname : "/",
);

// Registry des routes
const routes = signal<Route[]>([]);

export function defineRoutes(routeList: Route[]) {
  routes.value = routeList;
}

// Route actuellement matchée
const matchedRoute = computed(() => {
  const path = currentPath.value;
  return routes.value.find((r) => {
    if (r.path === path) return true;
    const pattern = r.path.replace(/:\w+/g, "[^/]+");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  });
});

// Navigation client-side
export function navigate(to: string, pushState = true) {
  if (typeof window === "undefined") return;
  if (pushState) {
    window.history.pushState({}, "", to);
  }
  currentPath.value = to;
}

// Back/Forward du navigateur
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    currentPath.value = window.location.pathname;
  });
}

// Composant Link
export const Link = cc<{ href: string; children: any }>(
  ({ href, children }) => {
    return (
      <a
        href={href}
        onClick={(e: MouseEvent) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
          e.preventDefault();
          navigate(href);
        }}
      >
        {children}
      </a>
    );
  },
);

// Outlet du routeur — le cœur de la SPA
export const RouterOutlet = cc<{ initialData?: any }>(({ initialData }) => {
  const data = signal<any>(initialData ?? null);

  if (typeof window !== "undefined") {
    effect(() => {
      const r = matchedRoute.value;
      if (r?.loader) {
        r.loader()
          .then((d: any) => {
            data.value = d;
          })
          .catch((e: any) => {
            console.error("Loader error:", e);
          });
      } else {
        data.value = null;
      }
    });
  }

  return (
    <div class="router-outlet">
      <Key when={currentPath} cache={false}>
        {() => {
          const r = matchedRoute.value;
          if (!r) return <div>404 - Page not found</div>;
          const Comp = r.component;
          // Passer routeData pour que la page puisse suivre les màj
          return <Comp routeData={data} {...(data.value || {})} />;
        }}
      </Key>
    </div>
  );
});

export function setInitialPath(path: string) {
  currentPath.value = path;
}
```

---

## 6. Pages avec loader

### src/spa/pages/Home.tsx

Page qui affiche des données du serveur. **Critique** : accepter `routeData` pour suivre les màj du loader.

```tsx
import { cc, For } from "sinwan/component";
import { signal, effect } from "sinwan/reactivity";
import { Link } from "../Router.tsx";

interface Database {
  name: string;
  sizeOnDisk: number;
}

interface HomeProps {
  databases?: Database[];
  routeData?: any; // Signal réactif du routeur
}

export const Home = cc<HomeProps>(({ databases: propDatabases, routeData }) => {
  // Initialiser avec les données SSR ou les props
  const databases = signal<Database[]>(
    propDatabases ||
    (typeof window !== "undefined" && (window as any).__INITIAL_DATA__?.databases) ||
    []
  );

  // S'assurer que la liste se met à jour quand le loader termine
  if (routeData) {
    effect(() => {
      const dbs = routeData.value?.databases;
      if (dbs) {
        databases.value = dbs;
      }
    });
  }

  return (
    <div style="padding: 20px;">
      <h1>Home</h1>
      <nav style="display: flex; gap: 20px; margin: 20px 0;">
        <Link href="/"><span>Home</span></Link>
        <Link href="/about"><span>About</span></Link>
        <Link href="/counter"><span>Counter</span></Link>
      </nav>

      <h2>Databases</h2>
      <ul>
        <For each={() => databases.value}>
          {(db) => (
            <li>
              {db.name} - {(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB
            </li>
          )}
        </For>
      </ul>
    </div>
  );
});

// Loader appelé côté client quand on navigue vers cette page
export async function homeLoader() {
  const res = await fetch("/api/dbs");
  const data = await res.json();
  return { databases: data.databases || [] };
}
```

### src/spa/pages/About.tsx

```tsx
import { cc } from "sinwan/component";
import { Link } from "../Router.tsx";

export const About = cc(() => {
  return (
    <div style="padding: 20px;">
      <h1>About</h1>
      <nav style="display: flex; gap: 20px; margin: 20px 0;">
        <Link href="/"><span>Home</span></Link>
        <Link href="/about"><span>About</span></Link>
      </nav>
      <p>This is the about page.</p>
    </div>
  );
});
```

### src/spa/pages/CounterPage.tsx

```tsx
import { cc } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { Link } from "../Router.tsx";

const Counter = cc<{ initial: number }>(({ initial }) => {
  const count = signal(initial);

  return (
    <div style="margin: 10px 0;">
      <button onClick={() => count.value--}>-</button>
      <span style="margin: 0 10px;">{count.value}</span>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
});

export const CounterPage = cc(() => {
  return (
    <div style="padding: 20px;">
      <h1>Counter Page</h1>
      <nav style="display: flex; gap: 20px; margin: 20px 0;">
        <Link href="/"><span>Home</span></Link>
        <Link href="/counter"><span>Counter</span></Link>
      </nav>
      <Counter initial={5} />
      <Counter initial={100} />
    </div>
  );
});
```

---

## 7. Hydration côté client

### src/spa/App.tsx

Définit les routes et injecte `RouterOutlet`.

```tsx
import { cc } from "sinwan/component";
import { defineRoutes, RouterOutlet, setInitialPath } from "./Router.tsx";
import { Home, homeLoader } from "./pages/Home.tsx";
import { About } from "./pages/About.tsx";
import { CounterPage } from "./pages/CounterPage.tsx";

const routes = [
  { path: "/", component: Home, loader: homeLoader },
  { path: "/about", component: About },
  { path: "/counter", component: CounterPage },
];

defineRoutes(routes);

export const App = cc<{ initialPath?: string; initialData?: any }>(
  ({ initialPath, initialData }) => {
    if (initialPath) {
      setInitialPath(initialPath);
    }

    return (
      <div class="app">
        <RouterOutlet initialData={initialData} />
      </div>
    );
  },
);
```

### src/client.tsx

```tsx
import { hydrate } from "sinwan/hydration";
import { App } from "./spa/App.tsx";

const initialPath = (window as any).__INITIAL_PATH__ || "/";
const initialData = (window as any).__INITIAL_DATA__ || {};

hydrate(App, document.getElementById("app")!, {
  initialPath,
  initialData,
});
```

---

## 8. Build de production

### build.ts

```ts
import { rm } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

// Build du bundle client
const result = await Bun.build({
  entrypoints: ["src/client.tsx"],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

console.log("✅ Client bundle built:");
for (const output of result.outputs) {
  console.log(
    `  ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`,
  );
}
```

### Serveur en production

En production, le serveur ne build plus à la volée. Il sert le fichier pré-buildé :

```ts
// Dans server.ts, remplacer la route /client.js
if (path === "/client.js") {
  const clientPath = import.meta.dir + "/../dist/client.js";
  const file = Bun.file(clientPath);
  return new Response(file, {
    headers: { "Content-Type": "application/javascript" },
  });
}
```

---

## 9. Best Practices

### 1. Toujours passer `routeData` aux pages avec loader

```tsx
// Router.tsx
return <Comp routeData={data} {...(data.value || {})} />;

// Home.tsx
if (routeData) {
  effect(() => {
    const dbs = routeData.value?.databases;
    if (dbs) databases.value = dbs;
  });
}
```

Sans `routeData`, une page recréée par `<Key>` avant que le loader ne termine restera vide à jamais.

### 2. Séparer clairement SSR vs SPA

| Fichier | Rôle |
|---------|------|
| `server.ts` | Bun.serve, `renderToHydratableString`, API routes |
| `client.tsx` | `hydrate()` uniquement |
| `spa/App.tsx` | Routes + `RouterOutlet` |
| `spa/pages/*.tsx` | Pages purement client (ou SSR'd + hydratées) |

### 3. Utiliser `<Key when={currentPath} cache={false}>`

Pour forcer le re-montage complet d'une page à chaque navigation (React-style). `cache={true}` est le mode keep-alive.

### 4. Gérer `__INITIAL_DATA__` et `__INITIAL_PATH__`

Toujours injecter ces variables dans le HTML serveur pour que le client puisse hydrater avec les mêmes données :

```html
<script>
  window.__INITIAL_PATH__ = "/";
  window.__INITIAL_DATA__ = {"databases":[...]};
</script>
```

### 5. Ne pas appeler `cc()` dans un `effect`

```tsx
// ❌ Mauvais
const Component = signal(cc(() => <div />));

// ✅ Bon
const MyComp = cc(() => <div />);
```

### 6. Utiliser `signal` pour l'état local, `provide/inject` pour le global

```tsx
import { provide, inject } from "sinwan/component";

const ThemeKey = Symbol("theme");

export const ThemeProvider = cc(({ children }) => {
  provide(ThemeKey, signal("dark"));
  return <div>{children}</div>;
});

export const useTheme = () => inject(ThemeKey);
```

### 7. Préférer `Bun.build` pour le bundle client

Bun.build est extrêmement rapide. En dev, on build à la volée. En production, on build une fois et on sert le fichier statique.

### 8. TypeScript strict

Activez `strict: true` dans `tsconfig.json`. Sinwan est entièrement typé — profitez-en.

---

## Démarrage rapide

```bash
# Dev
bun run dev

# Production build
bun run build
NODE_ENV=production bun run start
```

---

## Ressources

- [`09-ssr.md`](./09-ssr.md) — API serveur détaillée
- [`10-hydration.md`](./10-hydration.md) — Hydration avancée
- [`14-recipes.md`](./14-recipes.md) — Patterns courants
