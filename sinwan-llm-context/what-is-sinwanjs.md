# SinwanJS — Description Complete du Framework

> Vue d'ensemble exhaustive de SinwanJS : architecture, modules, fichiers et fonctionnalites.

---

## 1. Qu'est-ce que SinwanJS ?

SinwanJS est un **framework UI a reactivite fine** (inspire de SolidJS) avec :

- **Signals + Computed + Effects** pour la reactivite reactive
- **JSX compile en VNode tree** (pas de VDOM diffing)
- **SSR (Server-Side Rendering)** avec marqueurs d'hydratation
- **Hydratation cote client** qui reutilise le DOM serveur
- **Composants de controle** (`Show`, `For`, `Switch`, `Suspense`, etc.)
- **Architecture Islands** (hydratation partielle)
- **Toolchain Bun-first**
- **Intégration React** (compatibilite API React)

---

## 2. Architecture Generale

```
src/
├── common/           # Utilitaires partages
├── component/        # Factory de composants, controle-flow, lifecycle
├── event/            # Event bus, contexte SSR
├── hook/             # Hooks (useFetch)
├── jsx/              # Runtime JSX (jsx, jsxs, jsxDEV, Fragment)
├── reactivity/       # Signals, computed, effects, scheduler
├── renderer/         # Rendu DOM client, controle-flow
├── server/           # Rendu SSR, marqueurs d'hydratation, streaming
├── hydration/        # Hydratation DOM, walker, islands
├── store/            # Store reactive avec modifiers
├── integrations/     # Integrations (React, flow)
└── types.ts          # Types fondamentaux
```

---

## 3. Types Fondamentaux (`src/types.ts`)

```typescript
interface SinwanElement {
  tag: string | Function | Symbol; // "div", MyComp, Show, For, etc.
  props: Record<string, unknown>;
  children: SinwanNode[];
}

type SinwanNode =
  | SinwanElement
  | string
  | number
  | boolean
  | null
  | Signal<any>
  | Computed<any>
  | SinwanNode[];
```

- **SinwanElement** : Un noeud virtuel cree par JSX. Le renderer/hydrateur le parcourt une seule fois.
- **SinwanNode** : Type union representant tout ce qui peut etre rendu.

---

## 4. Reactivite (`src/reactivity/`)

| Fichier            | Fonctionnalite                                                      |
| ------------------ | ------------------------------------------------------------------- |
| `signal.ts`        | `signal<T>()` — valeur reactive mutable (`sig.value = x`)           |
| `computed.ts`      | `computed<T>()` — valeur derivee memoisee                           |
| `effect.ts`        | `effect(fn)` — effet de bord qui suit les lectures de signaux       |
| `scheduler.ts`     | Ordonnanceur de mise a jour des effets (batching)                   |
| `batch.ts`         | `batch(fn)` — groupe plusieurs mises a jour en une seule            |
| `normalization.ts` | `resolve()` — deroule `Signal<T> \| Computed<T> \| (() => T) → T`   |
| `observable.ts`    | Interoperabilite Observable pour les signaux                        |
| `on.ts`            | `on(deps, fn)` — effet qui ne s'execute que quand les deps changent |

### Principe cle

Les lectures de signaux a l'interieur d'un `effect()` sont **auto-trackées**. Modifier le signal re-execute l'effet.

---

## 5. Composants (`src/component/`)

| Fichier             | Fonctionnalite                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create.ts`         | `cc<P>(fn)` — factory de composants ("create component")                                                                                                             |
| `control-flow.ts`   | Composants de controle : `Show`, `For`, `Switch`, `Match`, `Dynamic`, `Index`, `Key`, `Portal`, `ErrorBoundary`, `Suspense`, `Activity`, `ViewTransition`, `Virtual` |
| `instance.ts`       | Gestion des instances de composants, arborescence parent/enfant, effets                                                                                              |
| `lifecycle.ts`      | Hooks de cycle de vie : `onMounted`, `onHydrated`, `onUnmounted`, `onError`                                                                                          |
| `provide-inject.ts` | `provide(key, value)` / `inject(key)` — DI par contexte                                                                                                              |
| `island.ts`         | `island(Component, { name })` — composants islands pour hydratation partielle                                                                                        |
| `index.ts`          | Re-exports publics du module component                                                                                                                               |

### `cc()` — Create Component

```typescript
const MyComp = cc<{ name: string }>(({ name }) => {
  return <div>Hello {name}</div>;
});
```

Les composants sont des **fonctions synchrones** qui retournent un arbre `SinwanElement`.

---

## 6. JSX Runtime (`src/jsx/`)

| Fichier              | Fonctionnalite                                                 |
| -------------------- | -------------------------------------------------------------- |
| `jsx-runtime.ts`     | `jsx()`, `jsxs()`, `jsxDEV()`, `Fragment`, `HtmlEscapedString` |
| `jsx-dev-runtime.ts` | Point d'entree dev pour `"jsx": "react-jsxdev"`                |
| `jsx-types.ts`       | Types JSX intrinseques (`SinwanIntrinsicElements`)             |

### Fonctionnement

TypeScript compile `<div>hello</div>` en :

```typescript
jsx("div", { children: "hello" });
```

Le JSX factory retourne un `SinwanElement` sans creer de DOM. Le renderer/hydrateur est le seul responsable de la creation des noeuds DOM.

---

## 7. Rendu Client (`src/renderer/`)

| Fichier                  | Fonctionnalite                                                  |
| ------------------------ | --------------------------------------------------------------- |
| `render-element.ts`      | Rendu des elements `SinwanElement` (intrinseques + composants)  |
| `render-control-flow.ts` | Rendu DOM pour `Show`, `For`, `Switch`, `Suspense`, etc.        |
| `render-children.ts`     | Rendu des enfants d'un element                                  |
| `mount.ts`               | `mount(component, container)` — monte un composant dans le DOM  |
| `unmount.ts`             | `unmount(node)` — detruit un noeud monte et nettoie les effets  |
| `attributes.ts`          | Application des attributs HTML (statiques + reactifs)           |
| `events.ts`              | Liaison des ecouteurs d'evenements                              |
| `dom-ops.ts`             | Operations DOM abstraites (createElement, createTextNode, etc.) |
| `template.ts`            | Optimisation par templates pour les elements statiques          |
| `suspense-boundary.ts`   | Gestion des limites `Suspense` pour les composants async        |
| `types.ts`               | Types du renderer (`MountedNode`, `AppInstance`, etc.)          |
| `index.ts`               | Re-exports publics                                              |

### Flux de rendu client

1. `mount(App, document.getElementById("app"))`
2. Cree l'instance de composant
3. Appelle `App()` → arbre `SinwanElement`
4. Parcours l'arbre → cree les noeuds DOM
5. Attache les effets reactifs (signaux)
6. Attache les ecouteurs d'evenements

---

## 8. Hydratation (`src/hydration/`)

| Fichier      | Fonctionnalite                                                           |
| ------------ | ------------------------------------------------------------------------ |
| `hydrate.ts` | `hydrate(component, container)` — entre point d'hydratation client       |
| `walk.ts`    | **Hydration walker** — parcourt le DOM existant et attache la reactivite |
| `markers.ts` | Detection et parsing des marqueurs d'hydratation dans le DOM             |
| `islands.ts` | `hydrateIslands(registry)` — hydratation partielle par islands           |
| `index.ts`   | Re-exports                                                               |

### Principe d'hydratation

Contrairement a `mount()`, `hydrate()` :

- **Ne cree pas** de nouveaux noeuds DOM
- **Reutilise** le DOM rendu par le serveur
- **Attache** les effets et les evenements aux noeuds existants
- **Doit matcher exactement** l'arbre serveur (pas de difference de structure)

### Marqueurs d'hydratation dans le HTML

- `data-sinwan-id="c0"` — limite de composant
- `<!--sinwan-t:0-->...<!--/sinwan-t-->` — slot de texte reactif
- `data-sinwan-ev="click:0"` — reference de binding d'evenement

---

## 9. SSR — Server-Side Rendering (`src/server/`)

| Fichier                | Fonctionnalite                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `hydration-markers.ts` | `renderToHydratableString()` — SSR avec marqueurs d'hydratation (two-pass) |
| `renderer.ts`          | `renderToString()` — SSR basique sans marqueurs                            |
| `stream.ts`            | `renderToStream()` — SSR en streaming pour reponse HTTP                    |
| `shell.ts`             | `renderToHydratablePage()` — rendu de page complete avec shell HTML        |
| `attribute-utils.ts`   | Escaping et normalisation des attributs HTML pour SSR                      |
| `index.ts`             | Re-exports publics du module server                                        |
| `Todo.md`              | Notes de developpement                                                     |

### Two-Pass SSR (nouveau)

`renderToHydratableString` fait **deux passes** :

1. **Premiere passe** : Rend le VNode tree → HTML. Les composants sync qui appellent `useFetch` declenchent des requetes HTTP. Les promesses sont collectees dans `ssrCtx.pendingFetches`.
2. **Attente** : `await Promise.all(pendingFetches)` — attend que toutes les requetes se terminent.
3. **Deuxieme passe** : Re-rend le composant avec `fetchCache` rempli → HTML final avec les donnees.
4. **Extraction** : `fetchCache` est serialize dans `out.fetchData` pour le client.

---

## 10. Event Bus & Contexte SSR (`src/event/`)

| Fichier          | Fonctionnalite                                                        |
| ---------------- | --------------------------------------------------------------------- |
| `bus.ts`         | `SinwanEventBus` — bus d'evenements pub/sub                           |
| `ssr-context.ts` | `SSRContext` avec `eventBus`, `state`, `fetchCache`, `pendingFetches` |
| `index.ts`       | Re-exports                                                            |

### SSRContext

```typescript
interface SSRContext {
  eventBus: SinwanEventBus; // Bus d'evenements par requete
  state: Map<string, unknown>; // Etat par requete
  fetchCache: Map<string, FetchCacheEntry>; // Cache des fetchs pour hydratation
  pendingFetches: Set<Promise<unknown>>; // Promesses de fetch en cours (two-pass SSR)
}
```

Fonctions cles :

- `createSSRContext()` — cree un contexte frais par requete
- `setSSRContext(ctx)` / `getSSRContext()` — contexte global par requete
- `getSSRFetchData()` — extrait le fetch cache pour serialisation

---

## 11. Hooks (`src/hook/`)

| Fichier        | Fonctionnalite                                         |
| -------------- | ------------------------------------------------------ |
| `use-fetch.ts` | `useFetch<T>(url).json()` — hook de fetch avec signaux |
| `index.ts`     | Re-exports                                             |

### `useFetch`

```typescript
const fetch = useFetch<CountryData>("/api/countries").json();
// fetch.data: Signal<CountryData | null>
// fetch.isFetching: Computed<boolean>
// fetch.error: Signal<string | null>
// fetch.execute(): Promise<Response>
```

Options :

- `immediate: boolean` — auto-execute a la creation (defaut: true)
- `initialData: T` — donnees initiales
- `refetch: boolean` — re-fetcher quand les deps changent
- `beforeFetch`, `afterFetch`, `onFetchError` — intercepteurs

**Comportement SSR (two-pass)** :

- **Serveur** : `execute()` est appele, la promesse est ajoutee a `ssrCtx.pendingFetches`
- **Client** : consomme `window.__SINWAN_FETCH_DATA__` **synchrone** avant le rendu

---

## 12. Store (`src/store/`)

| Fichier        | Fonctionnalite                                              |
| -------------- | ----------------------------------------------------------- |
| `store.ts`     | `createStore<T>()` — store reactive avec mutations trackées |
| `modifiers.ts` | `set()`, `unset()`, `reset()` — modifiers pour les stores   |
| `mutable.ts`   | Rendre un store mutable (pas de readonly)                   |
| `unwrap.ts`    | Deroule un store en objet plain                             |
| `_internal.ts` | Implementation interne du proxy de tracking                 |
| `index.ts`     | Re-exports                                                  |

---

## 13. Integrations (`src/integrations/`)

### React (`src/integrations/react/`)

Integration complete de l'API React pour compatibilite :

- `createRoot()` / `hydrateRoot()` — API React 18
- Composants : `Suspense`, `ErrorBoundary`, `Fragment`
- Hooks : `useState`, `useEffect`, `useRef`, `useMemo`, etc.
- Types JSX React

Plus de 60 fichiers pour la compatibilite complete React.

### Flow (`src/integrations/flow/`)

(Architecture flow, vide actuellement)

---

## 14. Utilitaires Communs (`src/common/`)

| Fichier      | Fonctionnalite                       |
| ------------ | ------------------------------------ |
| `escaper.ts` | Escaping HTML pour SSR (prevent XSS) |
| `index.ts`   | Re-exports                           |

---

## 15. Packages Externes (`packages/`)

| Package                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `bun-plugin-sinwan/`    | Plugin Bun pour bundler + transform JSX      |
| `vite-plugin-sinwan/`   | Plugin Vite pour bundler + transform JSX     |
| `create-sinwan/`        | CLI scaffolding (`npm create sinwan`)        |
| `eslint-plugin-sinwan/` | Regles ESLint specifiques a Sinwan           |
| `sinwan-router/`        | **Routeur officiel** de Sinwan (SPA routing) |
| `sinwan/`               | Package distribue (build output)             |

---

## 16. Application de Test (`sinwan-test-app/`)

SPA demo complete avec :

- **SSR** : serveur Bun qui sert des pages pre-rendues
- **Hydratation** : le client reprend le DOM serveur
- **Routage** : `Router.tsx` avec `RouterOutlet`, `Link`, `navigate()`
- **Pages** : Home, About, Counter, Country (avec `useFetch`)
- **Mock API** : `server/` (port 3002) fournit `/countries`

---

## 17. Build System

| Fichier                 | Fonction                                          |
| ----------------------- | ------------------------------------------------- |
| `build.ts`              | Script principal de build (CJS + ESM, dev + prod) |
| `scripts/bundle.ts`     | Wrapper Bun.build                                 |
| `scripts/make-shims.ts` | Generation des entry-point shims                  |

**Apres chaque modification du source core :**

```bash
bun run build.ts
```

---

## 18. Table de Routage des Fichiers → Fonctionnalites

### Reactivite

| Fonctionnalite        | Fichier(s)                                               |
| --------------------- | -------------------------------------------------------- |
| Signal                | `src/reactivity/signal.ts`                               |
| Computed              | `src/reactivity/computed.ts`                             |
| Effect                | `src/reactivity/effect.ts`                               |
| Batch/Scheduler       | `src/reactivity/scheduler.ts`, `src/reactivity/batch.ts` |
| Deroulement de valeur | `src/reactivity/normalization.ts`                        |

### Composants

| Fonctionnalite                  | Fichier(s)                        |
| ------------------------------- | --------------------------------- |
| Factory de composants           | `src/component/create.ts`         |
| Controle-flow (Show, For, etc.) | `src/component/control-flow.ts`   |
| Lifecycle hooks                 | `src/component/lifecycle.ts`      |
| DI (provide/inject)             | `src/component/provide-inject.ts` |
| Islands                         | `src/component/island.ts`         |

### Rendu

| Fonctionnalite         | Fichier(s)                                             |
| ---------------------- | ------------------------------------------------------ |
| Rendu DOM client       | `src/renderer/render-element.ts`                       |
| Rendu controle-flow    | `src/renderer/render-control-flow.ts`                  |
| Montage                | `src/renderer/mount.ts`                                |
| Demontage              | `src/renderer/unmount.ts`                              |
| Attributs + Evenements | `src/renderer/attributes.ts`, `src/renderer/events.ts` |

### SSR

| Fonctionnalite     | Fichier(s)                        |
| ------------------ | --------------------------------- |
| SSR avec marqueurs | `src/server/hydration-markers.ts` |
| SSR basique        | `src/server/renderer.ts`          |
| Streaming          | `src/server/stream.ts`            |
| Shell complet      | `src/server/shell.ts`             |

### Hydratation

| Fonctionnalite       | Fichier(s)                 |
| -------------------- | -------------------------- |
| Entree d'hydratation | `src/hydration/hydrate.ts` |
| Walker DOM           | `src/hydration/walk.ts`    |
| Marqueurs            | `src/hydration/markers.ts` |
| Islands              | `src/hydration/islands.ts` |

### Fetch

| Fonctionnalite  | Fichier(s)                        |
| --------------- | --------------------------------- |
| Hook useFetch   | `src/hook/use-fetch.ts`           |
| Cache SSR       | `src/event/ssr-context.ts`        |
| Deux-passes SSR | `src/server/hydration-markers.ts` |

---

## 19. Gestion des Erreurs

SinwanJS utilise plusieurs mecanismes de gestion d'erreurs :

1. **`ErrorBoundary`** — Capture les erreurs dans les composants enfants
2. **`onError`** hook — Callback quand une erreur survient dans un composant
3. **Suspense boundary** — Gere les composants async et les promesses
4. **`handleComponentError()`** dans `src/component/instance.ts`

---

## 20. Philosophie de Design

1. **Reactivite fine** : Pas de VDOM. Les effets mettent a jour le DOM directement.
2. **Synchrone par defaut** : Les composants sont des fonctions sync. Pas d'async/await dans le rendu.
3. **SSR-first** : Le serveur rend le HTML complet. Le client hydrate sans reconstruction.
4. **Deux-passes pour les donnees** : Les fetches async sont resolus en deux passes sur le serveur.
5. **Hydratation cache** : Les donnees fetchées sur le serveur sont serialisees et consommees synchrone sur le client.

---

_Document genere le : 2026-05-23_
