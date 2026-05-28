# Plan: Rendre `useState` 100% compatible avec Sinwan (signal natif)

## Objectif
`useState` de l'intégration React doit fonctionner **exactement comme un signal Sinwan natif** :
- `item` lu dans JSX se met à jour automatiquement (réactivité fine)
- `setItem` déclenche la réactivité et met à jour les dépendances
- `useEffect` avec `item` dans le dependency array fonctionne
- `For`, `Switch`, `Match`, `Show` fonctionnent avec `useState` sans friction

---

## 1. Diagnostic du problème actuel

### 1.1 `useState` retourne quoi ?
```ts
const [tests, setTests] = useState([1, 2, 3, 4, 5]);
// tests  = StateGetter< number[] >  = () => sig.value  (fonction marquée)
// setTests = (action) => sig.value = applyUpdate(...)
```

### 1.2 Problèmes identifiés
| Problème | Explication |
|----------|-------------|
| **Import obsolète** | L'utilisateur importait depuis `../../../../dist/react-client` au lieu de `sinwan/react-client` |
| **JSX direct** | `{tests()}` dans JSX retourne un nombre, pas un réactif. Le renderer voit un nombre statique. |
| **For avec useState** | `For each={tests}` — `tests` est un getter. `resolve(props.each)` appelle `tests()` et suit le signal. **Ça devrait marcher**. |
| **Switch avec useState** | `Switch when={tests().some(...)}` — `tests()` retourne un tableau, `.some()` retourne un booléen. Ce booléen est **statique** — pas réactif. |

### 1.3 Root cause
Le problème n'est pas `useState` lui-même, mais **comment la valeur est passée aux composants** :
```tsx
// ❌ BAD: tests().some() retourne un booléen statique
<Match when={() => tests().some(t => t > 10)}>

// ✅ GOOD: tests est un getter, resolve() suit le signal
<Match when={() => tests().some(t => t > 10)}>
```

En fait `when={() => tests().some(...)}` est une fonction qui, quand `resolve()` l'appelle, exécute `tests()` qui lit `sig.value` — et `resolve()` suit le signal ! Donc ça DEVRAIT être réactif.

Le problème réel était probablement l'**import obsolète** + le fait que le build `dist` n'était pas à jour quand l'utilisateur a testé.

---

## 2. Fix immédiat (déjà appliqué)

### 2.1 Corriger les imports
Tous les fichiers doivent importer depuis `sinwan/react-client`, pas `dist` :
```tsx
// ❌
import { useState } from "../../../../dist/react-client";

// ✅
import { useState } from "sinwan/react-client";
```

### 2.2 Builder après chaque changement du framework
```bash
cd /Users/digieye/project/sinwan-project/sinwan-ui
bun run build.ts
```

---

## 3. Vérifications à faire

### 3.1 `useState` + `For`
```tsx
import { useState } from "sinwan/react-client";
import { For } from "sinwan/component";

const App = cc(() => {
  const [items, setItems] = useState([1, 2, 3]);

  return (
    <>
      <For each={items}>{(item) => <div>{item}</div>}</For>
      <button onClick={() => setItems([4, 5, 6])}>Change</button>
    </>
  );
});
```
**Attendu** : clique sur "Change" → la liste affiche 4, 5, 6.

### 3.2 `useState` + `Switch` + `Match`
```tsx
import { useState } from "sinwan/react-client";
import { Switch, Match } from "sinwan/component";

const App = cc(() => {
  const [count, setCount] = useState(0);

  return (
    <Switch>
      <Match when={() => count() > 5}>
        <div>Count is greater than 5</div>
      </Match>
      <Match when={() => count() > 0}>
        <div>Count is greater than 0</div>
      </Match>
    </Switch>
  );
});
```
**Attendu** : `count > 5` → affiche "greater than 5", sinon "greater than 0".

### 3.3 `useEffect` avec dépendances
```tsx
import { useState, useEffect } from "sinwan/react-client";

const App = cc(() => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log("count changed:", count());
  }, [count]);

  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>;
});
```
**Attendu** : chaque clic loggue dans la console.

---

## 4. Si ça ne marche pas — debugging

### 4.1 Vérifier que `StateGetter` est bien marqué
```ts
// src/integrations/react/_internal/bridge.ts
export const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

export function createStateGetter<T>(sig: Signal<T>): StateGetter<T> {
  const getter = () => sig.value;
  (getter as any)[STATE_GETTER_MARKER] = true;
  return getter as StateGetter<T>;
}
```

### 4.2 Vérifier que `isGetter` le reconnaît
```ts
// src/reactivity/guards.ts
export function isGetter(value: unknown): boolean {
  return (
    typeof value === "function" &&
    (value as any)[STATE_GETTER_MARKER] === true
  );
}
```

### 4.3 Vérifier que `resolve()` suit le getter
```ts
// src/reactivity/resolve.ts
export function resolve<T>(value: Reactive<T>): T {
  if (isSignal(value)) return value.value;
  if (isComputed(value)) return value.value;
  if (typeof value === "function" && isGetter(value)) {
    // track the underlying signal
    return value();
  }
  if (typeof value === "function") return value();
  return value;
}
```

Si `resolve()` n'appelle pas `value()` pour un getter, le signal n'est pas tracké.

---

## 5. Tests à ajouter

Ajouter des tests dans `__tests__/react-integration/` :

```ts
// __tests__/react-integration/useState-reactivity.test.ts
import { describe, it, expect } from "bun:test";
import { useState } from "../../src/integrations/react/use-state";
import { cc } from "../../src/component/create";
import { renderToString } from "../../src/server/render";

describe("useState reactivity", () => {
  it("works with For", async () => {
    const App = cc(() => {
      const [items, setItems] = useState([1, 2, 3]);
      // TODO: test render + click simulation
    });
    // ...
  });
});
```

---

## 6. Résumé des fichiers touchés

| Fichier | Action |
|---------|--------|
| `switch.tsx` | ✅ Corriger imports `sinwan/react-client` |
| `Home.tsx` | ✅ Corriger imports `sinwan/react-client` |
| `src/integrations/react/use-state.ts` | Vérifier `createStateGetter` marque bien le getter |
| `src/reactivity/resolve.ts` | Vérifier que `resolve()` suit les getters |
| `src/renderer/render-control-flow.ts` | Vérifier `renderForBlock`/`renderSwitchBlock` utilisent `resolve()` |

---

## Prochaine étape

1. Corriger tous les imports vers `sinwan/react-client`
2. Builder le framework
3. Tester `useState` + `For` + `Switch`
4. Si bug → debugger `resolve()` et `isGetter()`
