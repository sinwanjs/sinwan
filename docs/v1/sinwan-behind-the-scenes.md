# Sinwan — Behind the Scenes

Ce document explique comment Sinwan fonctionne en interne et comment il réimplémente l'API React sans Virtual DOM.

---

## 1. Principe fondamental : pas de Virtual DOM

La plupart des frameworks (React, Vue en mode options, Inferno) utilisent un **Virtual DOM** : à chaque changement d'état, le composant est réexécuté, un nouvel arbre d'objets virtuels est produit, puis comparé ("diff") avec l'ancien pour calculer les mutations DOM minimales.

**Sinwan ne fait pas ça.**

```
React  : state change → re-render component → new VDOM tree → diff → patch DOM
Sinwan : state change → signal triggers → effect updates exactly 1 DOM node
```

Le composant fonction est appelé **une seule fois** au montage. Après ça, seuls des effets réactifs mettent à jour le DOM, un nœud ou un attribut à la fois.

---

## 2. Le modèle élémentaire

Le JSX dans Sinwan retourne un objet plat, léger et temporaire :

```ts
// src/jsx/jsx-runtime.ts
interface SinwanElement {
  tag: string | Function;
  props: Record<string, unknown>;
  children: SinwanNode[];
}
```

Pas de `VNode`, pas de `type` enum, pas de `key` spécial. Juste `{ tag, props, children }`. Ce n'est **pas** un nœud virtuel — c'est une description immédiate consommée par le renderer pour créer du vrai DOM.

---

## 3. Réactivité fine-grained : le cœur du système

### 3.1 Signal

Un `Signal<T>` contient une valeur et un `Set` d'abonnés (subscribers).

```ts
// src/reactivity/signal.ts (conceptuel)
class Signal<T> {
  private _value: T;
  subscribers = new Set<ReactiveEffect>();

  get value() {
    if (activeEffect) {
      this.subscribers.add(activeEffect);
      activeEffect.deps.add(this);
    }
    return this._value;
  }

  set value(v: T) {
    if (this._value !== v) {
      this._value = v;
      for (const effect of [...this.subscribers]) {
        effect.notify(); // planifie un re-run via microtask
      }
    }
  }
}
```

### 3.2 Effect

Un `ReactiveEffect` s'exécute une première fois immédiatement pour établir ses dépendances. À chaque fois qu'un signal lu pendant l'exécution change, l'effect est replanifié.

```ts
// src/reactivity/effect.ts
export class ReactiveEffect {
  run(): void {
    // 1. Se désabonner des anciennes deps
    this.cleanupDeps();
    // 2. Exécuter le cleanup utilisateur du run précédent
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    // 3. Pousser sur la pile de tracking et exécuter
    effectStack.push(this);
    activeEffect = this;
    try {
      const result = this.fn();
      if (typeof result === "function") this.cleanup = result;
    } finally {
      activeEffect = prevEffect;
      effectStack.pop();
    }
  }
}
```

**Points clés :**

- **`cleanupDeps()`** : à chaque re-run, l'effect se désabonne de tous les signaux qu'il avait lus au run précédent. Cela empêche les deps obsolètes de continuer à déclencher l'effect.
- **Pile d'effets (`effectStack`)** : gère les effets imbriqués. Un `computed` lu dans un `effect` s'enregistre comme dep de l'effect parent.
- **Guard anti-boucle** : `if (effectStack.includes(this)) return` empêche un effect de se re-déclencher synchrone sur lui-même.

### 3.3 Scheduler

Les signaux ne déclenchent pas les effects immédiatement. Ils les ajoutent à une file de microtâches, dédupliqués par identité :

```text
counter.value = 1;       ┐
counter.value = 2;      ├──> un seul flush microtask
counter.value = 3;      ┘
```

Les effects sont triés par leur `id` de création (monotonique) pour garantir que les effets parents s'exécutent avant les effets enfants. Les nouveaux effects planifiés pendant le flush sont drainés dans la même passe, avec une limite de sécurité (10) pour éviter les boucles infinies.

---

## 4. Le renderer client

### 4.1 Montage (`mount()`)

```ts
// src/renderer/mount.ts
export function mount(component, container, props) {
  const instance = ccInstance(component, props, null);
  setCurrentInstance(instance);
  const result = component(props);        // appelé UNE FOIS
  const root = renderElementToDOM(result, container);
  setCurrentInstance(null);
  fireMountedHooks(instance);             // bottom-up
  return { root, unmount() { ... } };
}
```

**Ordre :**

1. Créer l'instance de composant
2. Rendre l'instance "courante" (pour que `onMounted`, `provide`, `inject` s'enregistrent dessus)
3. Appeler `component(props)` **une seule fois**
4. Rendre le `SinwanElement` retourné en vrai DOM (`renderElementToDOM`)
5. Restaurer l'instance précédente
6. Déclencher `onMounted` (enfants d'abord, parent après)

### 4.2 Rendu d'un nœud en DOM

```ts
// src/renderer/render-children.ts
export function renderNodeToDOM(node, parent, anchor) {
  if (node == null || typeof node === "boolean") {
    // → TextNode vide
  } else if (typeof node === "string") {
    // → TextNode
  } else if (isReactive(node)) {
    // → Comment anchors + effect() qui swap le contenu
  } else if (Array.isArray(node)) {
    // → Fragment
  } else if (node instanceof Promise) {
    // → Placeholder async, swap quand résolu
  } else if (typeof node === "object" && "tag" in node) {
    // → SinwanElement → renderElementToDOM
  }
}
```

### 4.3 Nœud réactif (Signal enfant)

Quand un signal apparaît comme enfant JSX (`{count}`), le renderer :

```ts
// src/renderer/render-children.ts
function renderReactiveNodeToDOM(reactive, parent, anchor) {
  const startAnchor = domOps.createComment("Sinwan-r");
  const endAnchor = domOps.createComment("/Sinwan-r");

  let mountedContent = null;

  block.dispose = effect(() => {
    // 1. Supprimer l'ancien contenu
    if (mountedContent) removeMountedNode(mountedContent);
    // 2. Lire la valeur actuelle du signal
    const value = resolve(reactive);
    // 3. Créer le nouveau nœud DOM et l'insérer entre les anchors
    mountedContent = renderNodeToDOM(value, parent, endAnchor);
  });

  return block;
}
```

**Pas de diff.** L'effect supprime l'ancien contenu et insère le nouveau directement entre deux commentaires DOM (anchors).

---

## 5. Composant de contrôle de flux (`<Show>`, `<For>`)

Les composants structurels (conditions, listes) ne peuvent pas être gérés par le renderer standard car ils nécessitent une manipulation réactive du DOM au-delà du simple "créer une fois".

```ts
// src/component/control-flow.ts
export const SHOW_TYPE = Symbol.for("Sinwan.Show");

export function Show(props: ShowProps): SinwanElement {
  return { tag: SHOW_TYPE, props, children: [] };
}
```

Ils retournent un `SinwanElement` avec un **tag `Symbol`**. Le renderer les détecte et les route vers `renderControlFlowToDOM` qui :

- Crée des commentaires anchors stables
- S'abonne aux signaux de condition
- Swappe les sous-arbres DOM entiers quand la condition change
- Gère le lifecycle (unmount des composants enfants supprimés)

---

## 6. Intégration React : comment ça marche ?

### 6.1 `createRoot` → `mount()`

```ts
// src/integrations/react/create-root.ts
export function createRoot(container) {
  return {
    render(children) {
      const cmp = toComponent(children);
      app = mount(cmp, container, undefined, options);
    },
    unmount() {
      app?.unmount();
    },
  };
}
```

Pas de reconciliateur React. `createRoot` est un **wrapper** autour de `mount()` natif de Sinwan. Le composant React-compatible est appelé une fois, puis Sinwan prend le relais.

### 6.2 `useState` → `signal()`

```ts
// src/integrations/react/use-state.ts
export function useState<S>(initial): [() => S, Dispatch<SetStateAction<S>>] {
  const sig = useSignalSlot<S>(() =>
    typeof initial === "function" ? initial() : initial,
  );
  const setState = (action) => {
    sig.value = applyUpdate(sig.peek(), action);
  };
  return [createStateGetter(sig), setState];
}
```

- Crée un `Signal` Sinwan, pas une cellule React dans un fiber.
- Retourne un **getter** `() => S`, pas une valeur `S`. Pourquoi ? Parce que le renderer Sinwan traite les fonctions comme des nœuds réactifs. `{count}` dans JSX est détecté comme `isReactive(count)` → `renderReactiveNodeToDOM` crée un `effect` qui appelle `count()` à chaque changement.

### 6.3 `useEffect` — deux chemins selon les deps

```ts
// src/integrations/react/use-effect.ts
if (deps === undefined) {
  // Pas de tableau de deps
  // React : exécute après chaque render
  // Sinwan : onMounted + onUpdated (lifecycle hooks natifs)
  onMounted(() => run());
  onUpdated(() => run());
} else {
  // Avec deps → sinwanEffect réactif
  slot.dispose = sinwanEffect(() => {
    const currentDeps = resolveDeps(deps);
    if (!depsAreEqual(slot.deps, currentDeps)) {
      if (typeof slot.cleanup === "function") slot.cleanup();
      slot.deps = currentDeps;
      schedule(() => {
        slot.cleanup = runEffect();
      });
    }
  });
}
```

**Sans deps** : utilise les lifecycle hooks Sinwan. Le composant ne se réexécute jamais, mais `onUpdated` est déclenché quand les blocs réactifs du composant changent.

**Avec deps** : utilise `sinwanEffect()`. Si une dep est un getter de `useState` (marqué par `STATE_GETTER_MARKER`), l'effect lit la valeur du signal et s'abonne automatiquement. Quand le signal change, l'effect compare les deps et re-planifie le cleanup/setup.

### 6.4 `memo` → cache sur l'instance

```ts
// src/integrations/react/memo.ts
const Memoized = (props) => {
  const instance = getCurrentInstance();
  const cache = (instance[MEMO_CACHE_KEY] ??= {});
  if (cache.lastProps !== undefined && eq(cache.lastProps, props)) {
    return cache.lastResult; // même SinwanElement retourné
  }
  cache.lastProps = props;
  cache.lastResult = wrapped(props);
  return cache.lastResult;
};
```

`memo` compare les props et cache le `SinwanElement` sur l'instance. Mais dans Sinwan, le composant ne tourne qu'une fois, donc `memo` est surtout un **shim de compatibilité** — les signals font déjà le travail.

### 6.5 Où sont stockés les hooks ?

Pas dans un arbre de fibers React. Les hooks React-compatibles sont stockés comme **propriétés sur l'instance Sinwan** (`ComponentInstance`).

```ts
// src/integrations/react/_internal/bridge.ts
function getSlots(): HookSlots {
  const instance = getCurrentInstance();
  let slots = instance[HOOK_KEY];
  if (!slots) {
    slots = { cursor: 0, slots: [], signals: [] };
    instance[HOOK_KEY] = slots;
  }
  return slots;
}
```

Le `cursor` d'appel séquentiel fonctionne comme dans React (règle des hooks), mais les données vivent dans le même objet que `onMounted`, `effects`, et `provides`.

---

## 7. Tableau comparatif : React vs Sinwan

| Concept             | React (VDOM)                        | Sinwan (Fine-grained)                          |
| ------------------- | ----------------------------------- | ---------------------------------------------- |
| **JSX**             | Crée des VNodes (`ReactElement`)    | Crée des `SinwanElement` plats temporaires     |
| **Composant**       | Réexécuté à chaque state change     | Exécuté **une fois** au mount                  |
| **Mise à jour DOM** | Diff VDOM + patch                   | Effect direct sur le nœud/attribut concerné    |
| **State**           | `useState` → cellule dans fiber     | `signal()` → getter réactif                    |
| **Effect**          | Dépendances comparées entre renders | `sinwanEffect` s'abonne aux signals            |
| **Re-render**       | Composant re-tourne un nouvel arbre | Pas de re-render — le signal met à jour le DOM |
| **Cleanup effect**  | Avant le prochain run / unmount     | Avant le prochain run / dispose                |
| **Scheduler**       | Fiber priority lanes                | Microtask queue, tri par id de création        |
| **SSR**             | RenderToString + hydrate avec diff  | RenderToString + hydrate "walk and attach"     |

---

## 8. Points clés à retenir

1. **Le composant tourne une fois.** Toute la logique réactive est gérée par des effets attachés au DOM au moment du premier rendu.
2. **Les signals sont live.** Un getter `count()` retourne toujours la valeur actuelle. Les closures dans les cleanup doivent capturer explicitement si elles veulent une valeur figée.
3. **Pas de diff, pas de reconciliation.** Quand un signal change, exactement un nœud ou un attribut est mis à jour. C'est O(1) par signal, indépendant de la taille de l'arbre.
4. **L'API React est une couche d'adaptation.** Les hooks React sont réimplémentés avec des signals et des lifecycle hooks Sinwan. Le développeur écrit du code React-compatible, mais sous le capot c'est du fine-grained DOM direct.
