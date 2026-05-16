# Sinwan — React Integration APIs

## 1. Analyse d'utilisation dans le framework Sinwan

### APIs React utilisées en interne par Sinwan

Seuls **9 exports** de l'intégration React sont réellement importés/utilisés dans le code source du framework (`src/` hors `src/integrations/react`). Ils sont exportés depuis `src/index.ts` via `src/integrations/react/_shared.ts` :

| API                 | Alias dans Sinwan | Utilisation interne                                                                         |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `Fragment`          | `ReactFragment`   | Utilisé nativement par le JSX runtime (`src/jsx/jsx-runtime.ts`)                            |
| `createContext`     | —                 | Exposé pour les utilisateurs ; `Provider`/`Consumer` utilisent `provide`/`inject` de Sinwan |
| `memo`              | —                 | Wrapper de compatibilité React ; cache le résultat par instance de composant                |
| `lazy`              | —                 | Wrapper de compatibilité React ; intégré avec `Suspense`                                    |
| `use`               | —                 | Unwrap les Promises et lit les Contexts (interop React)                                     |
| `cache`             | —                 | Fonction de mémoïsation générique (interop React)                                           |
| `cacheSignal`       | —                 | Retourne le `AbortSignal` scoped à la requête SSR                                           |
| `addTransitionType` | —                 | Tags les transitions actives (interop React)                                                |
| `captureOwnerStack` | —                 | Debug : stack des composants parents (interop React)                                        |

### APIs React NON utilisées en interne par Sinwan

Toutes les autres APIs de l'intégration React **ne sont jamais utilisées par le framework lui-même**. Elles sont uniquement exposées pour permettre aux développeurs d'écrire du code React-compatible qui s'exécute sur le moteur réactif de Sinwan.

**Catégories non utilisées en interne :**

- **Tous les Hooks client** (`useState`, `useEffect`, `useRef`, `useMemo`, etc.)
- **Tous les composants client** (`Profiler`, `StrictMode`, `Suspense`, `Activity`, `ViewTransition`, etc.)
- **Tous les wrappers d'éléments HTML** (`Form`, `Input`, `Button`, `Select`, etc.)
- **Tous les resource hints** (`preload`, `preconnect`, `prefetchDNS`, etc.)
- **Toutes les APIs serveur** (`renderToString`, `renderToReadableStream`, `renderToPipeableStream`, etc.)
- **Toutes les APIs statiques** (`prerender`, `resumeAndPrerender`, etc.)
- **Root APIs** (`createRoot`, `hydrateRoot`, `act`, `flushSync`)

> **Note importante :** Aucun de ces composants n'est "mort" ou sans test — chaque fichier d'intégration possède sa suite de tests dédiée dans `__tests__/integrations/react/`. Ils sont simplement des **adaptateurs d'interopérabilité** (zero dépendance à `react` / `react-dom`).

---

## 2. Référence complète des APIs React Integration

### 2.1 Shared APIs (`sinwan` / `sinwan/react-client` / `sinwan/react-server`)

Ces APIs fonctionnent sur client et serveur.

#### `Fragment`

- **Fichier** : `src/integrations/react/fragment.ts`
- **Fonctionnement** : Re-export du symbole `Fragment` du JSX runtime de Sinwan. `<>...</>` et `<Fragment>...</Fragment>` résolvent vers le même nœud.

#### `createContext<T>(defaultValue: T)`

- **Fichier** : `src/integrations/react/create-context.ts`
- **Fonctionnement** : Crée un contexte React-compatible. Le `Provider` appelle `provide()` de Sinwan ; `useContext` délègue à `inject()`. Supporte la syntaxe shorthand React 19 `<MyContext value={x}>`.

#### `memo(Component, areEqual?)`

- **Fichier** : `src/integrations/react/memo.ts`
- **Fonctionnement** : Wrap un composant et cache son résultat par instance. Compare les props avec `shallowEqual` (ou custom `areEqual`). Identité `$$typeof = REACT_MEMO_TYPE`.

#### `lazy(load)`

- **Fichier** : `src/integrations/react/lazy.ts`
- **Fonctionnement** : Charge dynamiquement un composant. Jette une Promise au premier rendu pour que `Suspense` affiche le fallback. Cache le résultat après résolution.

#### `use(usable)`

- **Fichier** : `src/integrations/react/use.ts`
- **Fonctionnement** : Accepte un `Context` (délègue à `readContext`) ou une `Promise` (unwrap via cache WeakMap ; suspend en jetant la Promise si pending).

#### `cache(fn)`

- **Fichier** : `src/integrations/react/cache.ts`
- **Fonctionnement** : Retourne une version mémoïsée de `fn`. Clé par arguments (Object.is) via un trie de Maps. Les erreurs sont re-lancées sur hit.

#### `cacheSignal()`

- **Fichier** : `src/integrations/react/cache-signal.ts`
- **Fonctionnement** : Retourne l'`AbortSignal` scoped à la requête SSR en cours (si appelé pendant un render serveur), sinon `null`.

#### `addTransitionType(type)` / `getActiveTransitionTypes()`

- **Fichier** : `src/integrations/react/add-transition-type.ts`
- **Fonctionnement** : Enregistre un label string sur le tick de transition actif. `getActiveTransitionTypes()` retourne le `Set` actuel.

#### `captureOwnerStack()`

- **Fichier** : `src/integrations/react/capture-owner-stack.ts`
- **Fonctionnement** : Retourne une stack textuelle des composants parents (owners) depuis `getCurrentInstance()`, ou `null`.

---

### 2.2 Client Hooks (`sinwan/react-client`)

Tous les hooks sont implémentés **from scratch** (zéro import de React). Ils s'appuient sur le bridge interne (`_internal/bridge.ts`) pour stocker des slots par instance de composant.

#### `useState<S>(initial)`

- **Fichier** : `src/integrations/react/use-state.ts`
- **Retour** : `[() => S, Dispatch<SetStateAction<S>>]`
- **Fonctionnement** : Le state est stocké dans un `Signal` Sinwan privé. La valeur retournée est un **getter** `() => S` (pas une valeur brute), compatible avec le renderer de Sinwan. Supporte `valueOf`/`toString`/`Symbol.toPrimitive` pour la coercition implicite. L'arithmétique nécessite un appel explicite : `count() + 1`.

#### `useReducer<S, A>(reducer, initialState, init?)`

- **Fichier** : `src/integrations/react/use-reducer.ts`
- **Retour** : `[() => S, Dispatch<A>]`
- **Fonctionnement** : Idem `useState` mais avec un reducer. Le dispatch appelle `reducer` puis met à jour le signal.

#### `useRef<T>(initialValue?)`

- **Fichier** : `src/integrations/react/use-ref.ts`
- **Fonctionnement** : Retourne un objet `{ current: T }` stocké dans un slot. **Non réactif** (identique à React).

#### `useMemo<T>(factory, deps?)`

- **Fichier** : `src/integrations/react/use-memo.ts`
- **Fonctionnement** : Mémorise le résultat de `factory` par `deps` (comparaison `Object.is`). Si `deps` omis, recalcule à chaque appel.

#### `useCallback<T>(callback, deps?)`

- **Fichier** : `src/integrations/react/use-callback.ts`
- **Validation React doc** : Conforme — implémenté comme `useMemo(() => callback, deps)` avec `Object.is` pour la comparaison des dépendances.
- **Fonctionnement** :
  - Si `deps` est fourni, mémorise la référence de `callback` par instance de composant (slot). Retourne la même référence tant que les deps ne changent pas (`Object.is`).
  - Si `deps` est omis, retourne `callback` directement (pas de cache — même comportement React).
  - Préserve le `this`-binding car la référence originale est retournée, pas un wrapper.
  - **Reactivity Sinwan** : Contrairement à React où `useCallback` empêche les re-rendus d'enfants `memo` (car le composant parent re-run à chaque state change), en Sinwan le setup ne s'exécute qu'une fois. `useCallback` reste utile pour : (1) éviter l'invalidation du cache `memo` des enfants, (2) stabiliser une dépendance dans `useEffect`, et (3) compatibilité API React.

#### `useId()`

- **Fichier** : `src/integrations/react/use-id.ts`
- **Fonctionnement** : Génère un ID stable et déterministe par instance (`prefix:s<uid>-<counter>:`). Hydration-safe.

#### `useContext<T>(context)`

- **Fichier** : `src/integrations/react/use-context.ts`
- **Fonctionnement** : Délègue à `readContext` qui appelle `inject(context._key, defaultValue)`.

#### `useDebugValue<T>(value, format?)`

- **Fichier** : `src/integrations/react/use-debug-value.ts`
- **Fonctionnement** : No-op en production. En dev, stocke une valeur formatée sur l'instance pour introspection DevTools.

#### `useEffect(callback, deps?)`

- **Fichier** : `src/integrations/react/use-effect.ts`
- **Fonctionnement** :
  - **Sans deps** : utilise `onMounted` + `onUpdated`, schedule via `queueMicrotask` (après paint).
  - **Avec deps** : utilise `sinwanEffect` pour watcher les dépendances. Cleanup avant nouveau setup. `resolveDeps` déréférence uniquement les getters marqués `STATE_GETTER_MARKER`.
  - SSR : no-op.

#### `useLayoutEffect(callback, deps?)`

- **Fichier** : `src/integrations/react/use-layout-effect.ts`
- **Fonctionnement** : Synchrone (avant paint). Identique à `useEffect` mais sans `queueMicrotask` — le setup/cleanup sont synchrones. SSR : no-op.

#### `useInsertionEffect(callback, deps?)`

- **Fichier** : `src/integrations/react/use-insertion-effect.ts`
- **Fonctionnement** : Synchrone, identique à `useLayoutEffect`. Conçu pour CSS-in-JS (injecter `<style>` avant layout). SSR : no-op.

#### `useEffectEvent(fn)`

- **Fichier** : `src/integrations/react/use-effect-event.ts`
- **Fonctionnement** : Retourne une fonction qui appelle toujours la dernière closure. L'identité de la fonction retournée est **intentionnellement instable** (détecte les bugs de deps).

#### `useTitle(title, options?)`

- **Fichier** : `src/integrations/react/use-title.ts`
- **Fonctionnement** : Met à jour `document.title` de manière déclarative. Restaure le titre au unmount par défaut. Si `title` est réactif (signal/computed), un effet Sinwan met à jour le DOM automatiquement.

#### `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`

- **Fichier** : `src/integrations/react/use-sync-external-store.ts`
- **Fonctionnement** : Alloue un signal interne, abonne `subscribe` au montage, et lit `getSnapshot`. Serveur : exige `getServerSnapshot`.

#### `useDeferredValue<T>(value, initialValue?)`

- **Fichier** : `src/integrations/react/use-deferred-value.ts`
- **Fonctionnement** : Retourne une valeur décalée d'un tick. Mise à jour via `nextTick` (pas synchronement). En transition, applique immédiatement.

#### `useTransition()`

- **Fichier** : `src/integrations/react/use-transition.ts`
- **Retour** : `[boolean, TransitionStartFunction]`
- **Fonctionnement** : `isPending` est un signal Sinwan. `startTransition` exécute dans un batch Sinwan + flag de transition. `isPending` retourne à `false` à la fin (promise ou sync).

#### `startTransition(callback)`

- **Fichier** : `src/integrations/react/start-transition.ts`
- **Fonctionnement** : Version top-level de `useTransition`. Exécute `callback` dans un batch + transition. Nettoie les transition types.

#### `useOptimistic<S, A>(passthrough, reducer?)`

- **Fichier** : `src/integrations/react/use-optimistic.ts`
- **Retour** : `[() => S, (action: A) => void]`
- **Fonctionnement** : Signal interne initialisé à `passthrough`. Réinitialise automatiquement quand `passthrough` change. `addOptimistic` applique le reducer immédiatement (UI optimiste).

#### `useActionState<S, P>(reducerAction, initialState, permalink?)`

- **Fichier** : `src/integrations/react/use-action-state.ts`
- **Retour** : `[Awaited<S>, (payload: P) => Promise<Awaited<S>>, boolean]`
- **Fonctionnement** : File d'actions (queue). Exécute séquentiellement dans une transition + batch. `isPending` reflète l'activité de la queue. En cas d'erreur, annule le reste de la queue.

#### `useImperativeHandle(ref, init, deps?)`

- **Fichier** : `src/integrations/react/use-imperative-handle.ts`
- **Fonctionnement** : Crée un handle via `init()` et l'assigne à `ref.current` (ou appelle le ref callback). Recrée quand les deps changent. SSR : no-op.

#### `useFormStatus()`

- **Fichier** : `src/integrations/react/use-form-status.ts`
- **Retour** : `FormStatus` (pending, data, method, action)
- **Fonctionnement** : Lit un signal global (`formStatus`) mis à jour par le wrapper `<Form>`. Chaque propriété est un getter réactif (computed). SSR : retourne le sentinel "not pending".

---

### 2.3 Client Components & DOM APIs (`sinwan/react-client`)

#### `Profiler`

- **Fichier** : `src/integrations/react/profiler.ts`
- **Fonctionnement** : Enregistre `performance.now()` autour du mount/update et appelle `onRender(id, phase, actualDuration, ...)`. SSR : callback jamais appelé.

#### `StrictMode`

- **Fichier** : `src/integrations/react/strict-mode.ts`
- **Fonctionnement** : Pass-through inerte. Sinwan n'a pas de double-invocation intentionnelle.

#### `Suspense`

- **Fichier** : `src/integrations/react/suspense.ts`
- **Fonctionnement** : Retourne un élément avec `tag: SUSPENSE_TYPE` (control-flow natif Sinwan). Le renderer gère le fallback ↔ contenu résolu via un signal. Streaming SSR : fallback puis contenu asynchrone.

#### `Activity`

- **Fichier** : `src/integrations/react/activity.ts`
- **Fonctionnement** : `mode="visible"` rend normalement. `mode="hidden"` garde le DOM monté mais masque visuellement (`display: none`). Les effets internes sont nettoyés quand hidden, recréés quand visible.

#### `ViewTransition` / `unstable_ViewTransition`

- **Fichier** : `src/integrations/react/view-transition.ts`
- **Fonctionnement** : Control-flow Sinwan (`VIEW_TRANSITION_TYPE`). Applique `view-transition-name` au wrapper DOM le plus proche quand `name` est fourni. Supporte `enter`/`exit`/`update`/`share`/`default` classes et callbacks `onEnter`/`onExit`/`onUpdate`/`onShare`. SSR : safe (children rendus normalement).

#### `unstable_startViewTransition(callback)`

- **Fichier** : `src/integrations/react/view-transition.ts`
- **Fonctionnement** : Délègue à `document.startViewTransition` si disponible, sinon exécute `callback` et retourne `{ finished: Promise.resolve() }`.

#### `createPortal(children, container, key?)`

- **Fichier** : `src/integrations/react/create-portal.ts`
- **Fonctionnement** : Délègue au composant natif `Portal` de Sinwan. Monte les enfants dans `container` hors du parent React.

#### `flushSync(callback?)`

- **Fichier** : `src/integrations/react/flush-sync.ts`
- **Fonctionnement** : Exécute `callback` puis vide immédiatement le scheduler Sinwan (`flushSync`). SSR : throw.

#### `act(scope)`

- **Fichier** : `src/integrations/react/act.ts`
- **Fonctionnement** : Exécute `scope`, attend la Promise, puis draine les effets Sinwan jusqu'à stabilisation (5 ticks + flush). Exige `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

#### `createRoot(container, options?)`

- **Fichier** : `src/integrations/react/create-root.ts`
- **Fonctionnement** : Wrap `mount()` de Sinwan. Retourne `{ render(children), unmount() }`. Supporte `identifierPrefix`, `onUncaughtError`, etc.

#### `hydrateRoot(container, children, options?)`

- **Fichier** : `src/integrations/react/hydrate-root.ts`
- **Fonctionnement** : Wrap `hydrate()` de Sinwan pour le premier rendu, puis `mount()` pour les updates suivantes. Retourne un `Root` identique.

#### `hydrateIslands(registry, root?)`

- **Fichier** : `src/integrations/react/_client.ts` (re-export depuis `src/hydration/islands.ts`)
- **Fonctionnement** : Hydrate uniquement les îles (`data-sinwan-island`) trouvées dans le DOM. Composants React-style compatibles sans modification.

---

### 2.4 Server APIs (`sinwan/react-server`)

Toutes ces APIs sont des **pass-through** vers le renderer/serveur natif de Sinwan, avec des signatures compatibles React.

#### `renderToString(node, options?)`

- **Fichier** : `src/integrations/react/render-to-string.ts`
- **Fonctionnement** : Délegue à `renderNodeToHydratableString`. Retourne `Promise<string>` (async, contrairement à React qui est sync, car Sinwan supporte les composants async).

#### `renderToStaticMarkup(node, options?)`

- **Fichier** : `src/integrations/react/render-to-static-markup.ts`
- **Fonctionnement** : Idem `renderToString` mais strip les marqueurs d'hydratation (`data-sinwan-id`, `data-sinwan-ev`, `<!--sinwan-t-->`). Non hydratable.

#### `renderToReadableStream(node, options?)`

- **Fichier** : `src/integrations/react/render-to-readable-stream.ts`
- **Fonctionnement** : Délegue à `streamHydratableNode`. Retourne un `ReadableStream<Uint8Array>` avec `.allReady`. Supporte `bootstrapScripts`, `bootstrapModules`, `signal` (abort), `onError`.

#### `renderToPipeableStream(node, options?)`

- **Fichier** : `src/integrations/react/render-to-pipeable-stream.ts`
- **Fonctionnement** : Idem mais retourne un `PipeableStream` Node.js avec `.pipe(writable)` et `.abort(reason)`. Fires `onShellReady`, `onAllReady`, `onShellError`, `onError`.

#### `resume(node, postponedState, options?)`

- **Fichier** : `src/integrations/react/resume.ts`
- **Fonctionnement** : React resume — Sinwan ne postpone pas, donc re-render from scratch via `renderToReadableStream`. `postponedState` ignoré (compat API).

#### `resumeToPipeableStream(node, postponedState, options?)`

- **Fichier** : `src/integrations/react/resume.ts`
- **Fonctionnement** : Idem via `renderToPipeableStream`.

#### `renderShell(node, options?)` / `streamShell(node, options?)`

- **Fichier** : `src/integrations/react/_server.ts` (re-export depuis `src/server/shell.ts`)
- **Fonctionnement** : Génère un document HTML complet avec shell + boot snippet d'hydratation. Framework-agnostic.

#### `island(Component, options?)` / `isIslandElement(node)`

- **Fichier** : `src/integrations/react/_server.ts` (re-export depuis `src/component/island.ts`)
- **Fonctionnement** : Wrapper de partial hydration. Marque un composant pour qu'il ne soit hydraté que côté client (avec props sérialisées dans le DOM).

---

### 2.5 Static APIs (`sinwan/react-static`)

#### `prerender(node, options?)`

- **Fichier** : `src/integrations/react/prerender.ts`
- **Fonctionnement** : Prerender build-time. Attend tous les Suspense. Retourne `{ prelude: ReadableStream<Uint8Array>, postponed: null }`. Supporte `bootstrapScripts`/`bootstrapModules`.

#### `prerenderToNodeStream(node, options?)`

- **Fichier** : `src/integrations/react/prerender.ts`
- **Fonctionnement** : Idem mais convertit le prelude en Node.js `ReadableStream` via `node:stream`.

#### `resumeAndPrerender(node, postponedState, options?)`

- **Fichier** : `src/integrations/react/resume-and-prerender.ts`
- **Fonctionnement** : Compat API — délègue à `prerender`. `postponedState` ignoré.

#### `resumeAndPrerenderToNodeStream(node, postponedState, options?)`

- **Fichier** : `src/integrations/react/resume-and-prerender.ts`
- **Fonctionnement** : Compat API — délègue à `prerenderToNodeStream`. `postponedState` ignoré.

---

### 2.6 Resource Hints (`sinwan/react-client`)

#### `preconnect(href, options?)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : Ajoute `<link rel="preconnect">` dans `document.head`. Déduplication par clé `(rel|href|attrs)`.

#### `prefetchDNS(href)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : Ajoute `<link rel="dns-prefetch">`. Idempotent.

#### `preload(href, options)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : Ajoute `<link rel="preload">`. Pour images, la déduplication considère aussi `imageSrcSet` + `imageSizes`.

#### `preloadModule(href, options?)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : Ajoute `<link rel="modulepreload">`.

#### `preinit(href, options)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : `as: "style"` → `<link rel="stylesheet">` ; `as: "script"` → `<script async src>`.

#### `preinitModule(href, options?)`

- **Fichier** : `src/integrations/react/resource-hints.ts`
- **Fonctionnement** : Ajoute `<script type="module" src>`.

---

### 2.7 Element Wrappers (`sinwan/react-client`)

Ces wrappers retournent des éléments intrinsèques Sinwan avec des comportements React-compatibles.

#### `Form`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Intercepte la prop `action`. Si c'est une fonction, exécute en transition, met à jour `useFormStatus` (pending), et reset le formulaire au succès.

#### `Input`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through avec support `checked`/`value` réactifs (effect DOM pour synchroniser).

#### `Button`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through. Supporte `formAction` fonction (comme `<Form>`).

#### `Select`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Synchronise `value` réactif avec le DOM `select.value` via effect.

#### `Textarea`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Supporte `value` contrôlé (getter réactif ou string) et `defaultValue`. Rejette les children.

#### `Option`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through standard.

#### `Progress`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through standard.

#### `Link`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through. Supporte les attributs React (crossOrigin, etc.).

#### `Meta`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through. Supporte les attributs React.

#### `Script`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through. Supporte `crossOrigin`, `noModule`, etc.

#### `Style`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through. Accepte `precedence` pour le regroupement (registry interne).

#### `Title`

- **Fichier** : `src/integrations/react/elements.ts`
- **Fonctionnement** : Pass-through vers `<title>`. Non réactif en SSR.

---

## 3. Async Components and Promises

Sinwan treats `Promise<SinwanNode>` as a first-class renderable type. Unlike React (which requires throwing a Promise inside a `<Suspense>` boundary), Sinwan accepts Promises implicitly at any position in the tree.

### 3.1 Type system

`@/Users/digieye/project/sinwan-project/sinwan-ui/src/types.ts:29-37`

```ts
export type SinwanNode =
  | SinwanPrimitive
  | SinwanElement
  | Promise<SinwanElement> // ← async node support
  | HtmlEscapedString
  | Signal<unknown>
  | Computed<unknown>
  | (() => unknown)
  | SinwanNode[];
```

Components themselves can also return a Promise:

`@/Users/digieye/project/sinwan-project/sinwan-ui/src/types.ts:42-46`

```ts
export interface SinwanComponent<P extends object = {}> {
  (
    props: P & { children?: SinwanNode | SinwanSlots },
  ): SinwanNode | Promise<SinwanNode>;
}
```

### 3.2 Root-level async component

`@/Users/digieye/project/sinwan-project/sinwan-ui/src/renderer/mount.ts:60-95`

When `mount()` detects that the root component returned a `Promise`:

1. A placeholder text node is inserted into the container.
2. On resolution, the container is cleared and the resolved tree is rendered.
3. `onMounted` hooks are fired **after** the resolved content is in the DOM.
4. On rejection, the placeholder is cleared and `handleComponentError` reports the error.

**Example:**

```tsx
const UserProfile = async ({ userId }: { userId: string }) => {
  const user = await fetchUser(userId); // async data fetch
  return (
    <div class="profile">
      <h1>{user.name}</h1>
    </div>
  );
};

// No Suspense boundary required
mount(UserProfile, document.getElementById("app")!, { userId: "42" });
```

### 3.3 Nested async children

`@/Users/digieye/project/sinwan-project/sinwan-ui/src/renderer/render-children.ts:81-116`

Any child that evaluates to a Promise is handled by `renderNodeToDOM`:

1. Comment anchors `<!--Sinwan-a-->` and `<!--/Sinwan-a-->` delimit the async region.
2. An empty text placeholder sits between the anchors.
3. When the Promise resolves, the placeholder is removed and the resolved node is rendered in its place.
4. `onMounted` hooks fire after insertion; `queueUpdatedHooks` notifies the parent.

**Example:**

```tsx
const App = () => (
  <div>
    <h1>Dashboard</h1>
    {fetchStats().then((stats) => (
      <StatsPanel data={stats} />
    ))}
  </div>
);
```

The `fetchStats()` Promise is a valid child. The renderer swaps it automatically.

### 3.4 SSR / Streaming

Because `renderToString` and `renderToReadableStream` are async by design, they naturally await async components during rendering. No extra wrapper is needed.

```ts
const html = await renderToString(<Page />);   // awaits all async branches
```

### 3.5 Caveats

#### Lifecycle timing

- **`onMounted` fires after the Promise resolves**, not when the placeholder first appears. If you need to show loading state immediately, render it synchronously alongside the Promise.
- **`onUnmounted` is safe**: if the component is unmounted before the Promise resolves, the `disposed` flag on `MountedAsync` prevents the resolved content from being inserted.

#### Error handling

- Rejected Promises at the root trigger `handleComponentError` and clear the container.
- Rejected nested Promises currently leave the placeholder in place. Wrap with `try/catch` inside the component, or use a custom error-boundary wrapper.

#### No Suspense boundary required (but `Suspense` exists)

Sinwan’s implicit async handling means you do **not** need `<Suspense>` to accept Promises. However, the React-compatible `Suspense` component is still available for explicit fallback control:

```tsx
<Suspense fallback={<Spinner />}>
  <AsyncChart />
</Suspense>
```

### 3.6 Comparison with other frameworks

| Feature                     | Sinwan                      | React 18+                       | Vue 3                      | SolidJS                    | Marko                      |
| --------------------------- | --------------------------- | ------------------------------- | -------------------------- | -------------------------- | -------------------------- |
| Async component return type | `Promise<SinwanNode>`       | Not supported (throws Promise)  | `async setup()` + Suspense | Returns a Promise resource | `<await>` tag              |
| Promise as child node       | ✅ Implicit anywhere        | ❌ Must throw inside Suspense   | ✅ With `<Suspense>`       | ✅ Under `<Suspense>`      | ✅ Native                  |
| Suspense boundary required  | ❌ No                       | ✅ Yes                          | ✅ Yes                     | ✅ Yes                     | ❌ No                      |
| Root async component        | ✅ Yes (placeholder + swap) | ❌ No                           | ⚠️ Limited                 | ⚠️ Limited                 | ✅ Yes                     |
| Nested async children       | ✅ Yes (anchors + swap)     | ❌ No                           | ✅ Yes                     | ✅ Yes                     | ✅ Yes                     |
| SSR streaming support       | ✅ Built-in (async render)  | ✅ `renderToPipeableStream`     | ✅ `renderToStream`        | ✅ `renderToString` async  | ✅ Native streaming        |
| Error handling (root)       | `handleComponentError`      | `onError` boundary              | `onErrorCaptured`          | Error boundary             | Try/catch around `<await>` |
| `onMounted` timing          | After resolution            | N/A (no direct async component) | After resolution           | After resolution           | After resolution           |

> **Key takeaway:** Sinwan’s “implicit async anywhere” model removes the need for a Suspense boundary to accept Promises, while still offering React-compatible `<Suspense>` for fallback control.

---

## 4. Architecture interne clé

### Bridge (`_internal/bridge.ts`)

- **`useSignalSlot(factory)`** : Crée ou récupère un `Signal` stocké sur l'instance courante.
- **`useSlot(factory)`** : Crée ou récupère une valeur opaque stockée sur l'instance.
- **`createStateGetter(signal)`** : Retourne une fonction getter marquée avec `STATE_GETTER_MARKER` (pour que `resolveDeps` la déréférence).
- **`STATE_GETTER_MARKER`** : `Symbol.for("sinwan.state_getter")` — discrimine les getters d'état des fonctions utilisateur arbitraires dans les deps.

### Lifecycle Mapping

| React                  | Sinwan                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `componentDidMount`    | `onMounted`                                                   |
| `componentDidUpdate`   | `onUpdated`                                                   |
| `componentWillUnmount` | `onUnmounted`                                                 |
| render (re-run)        | Pas de re-run — les signals mettent à jour le DOM directement |
| `useEffect` no-deps    | `onMounted` + `onUpdated` + `queueMicrotask`                  |
| `useEffect` with deps  | `sinwanEffect` + `queueMicrotask`                             |
| `useLayoutEffect`      | `sinwanEffect` synchrone (pas de microtask)                   |

### Dépendances (`depsAreEqual`)

- Comparaison via `Object.is` (standard React).
- `resolveDeps` appelle uniquement les fonctions marquées `STATE_GETTER_MARKER`.

---

## 5. Development Diagnostics (`__DEV__`)

SinwanJS provides several development-only warnings to help catch common React integration mistakes early. These warnings mimic React's developer experience and are automatically stripped out in production builds (when `__DEV__` is false).

### Invalid Hook Calls
If you attempt to call a React hook outside of a component setup function (e.g., inside an event handler, after an `await` in an async component, or outside any component), SinwanJS will log a detailed warning explaining that this violates the Rules of Hooks, before throwing an error.

### Server-Side `useLayoutEffect`
Calling `useLayoutEffect` on the server is a no-op, but it often indicates a bug because the effect cannot run during SSR, leading to hydration mismatches. SinwanJS logs a warning when `useLayoutEffect` is called during SSR, advising you to use it only in client-side components.

### Async Action State Transitions
When using `useActionState`, if an asynchronous action is dispatched outside of a transition context (and not on the server), SinwanJS warns you that `isPending` might not update correctly, mirroring React's behavior.

---

## 6. Résumé des exports par sub-path

| Sub-path              | Exports                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sinwan` (main)       | `ReactFragment`, `createContext`, `memo`, `lazy`, `use`, `cache`, `cacheSignal`, `addTransitionType`, `captureOwnerStack`                                                                         |
| `sinwan/react-client` | Toutes les Shared APIs + tous les Hooks + tous les Composants Client + Root APIs + Resource Hints + Element Wrappers + `hydrateIslands` + `act`                                                   |
| `sinwan/react-server` | Toutes les Shared APIs + `renderToString`, `renderToStaticMarkup`, `renderToReadableStream`, `renderToPipeableStream`, `resume`, `resumeToPipeableStream`, `renderShell`, `streamShell`, `island` |
| `sinwan/react-static` | Toutes les Shared APIs + `prerender`, `prerenderToNodeStream`, `resumeAndPrerender`, `resumeAndPrerenderToNodeStream`                                                                             |
