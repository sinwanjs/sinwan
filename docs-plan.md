# Plan de réorganisation de la documentation Sinwan

**Option choisie : Astro Starlight**  
Migration complète vers Astro Starlight. Coût initial 5-7 jours, maintenance quasi-nulle après.

---

## Structure de fichiers cible

```
docs/
├── astro.config.mjs          # (si Starlight) ou vite.config.ts
├── src/
│   └── content/
│       └── docs/
│           ├── index.mdx              # Landing page
│           │
│           ├── core/
│           │   ├── index.mdx          # Overview : pourquoi Sinwan
│           │   ├── philosophy.md
│           │   ├── getting-started.md
│           │   ├── architecture.md
│           │   └── troubleshooting.md
│           │
│           ├── reactivity/
│           │   ├── index.mdx          # signal, computed, effect, batch…
│           │   ├── signal.md
│           │   ├── computed.md
│           │   ├── effect.md
│           │   ├── untrack.md
│           │   ├── on.md
│           │   ├── observable.md
│           │   ├── batch.md
│           │   └── nextTick.md
│           │
│           ├── stores/
│           │   ├── index.mdx          # createStore, createMutable, produce…
│           │   ├── createStore.md
│           │   ├── createMutable.md
│           │   ├── modifyMutable.md
│           │   ├── produce.md
│           │   ├── reconcile.md
│           │   └── unwrap.md
│           │
│           ├── components/
│           │   ├── index.mdx
│           │   ├── cc.md
│           │   ├── lifecycle.md         # onMounted, onUnmounted, onUpdated, onDispose, onHydrated, onServer, onClient, onError
│           │   ├── provide-inject.md    # provide, inject, getCurrentInstance
│           │   └── islands.md           # island, isIslandElement
│           │
│           ├── control-flow/
│           │   ├── index.mdx
│           │   ├── Show.md
│           │   ├── For.md
│           │   ├── Switch.md
│           │   ├── Match.md
│           │   ├── Index.md
│           │   ├── Key.md
│           │   ├── Dynamic.md
│           │   ├── Visible.md
│           │   ├── Portal.md
│           │   ├── ErrorBoundary.md
│           │   └── Virtual.md
│           │
│           ├── jsx/
│           │   ├── index.mdx
│           │   ├── jsx-runtime.md      # jsx, jsxs, jsxDEV, Fragment
│           │   ├── jsx-dev-runtime.md
│           │   ├── raw.md              # raw, HtmlEscapedString
│           │   └── escaping.md         # escapeHtml, safeHtml, isSafeHtml
│           │
│           ├── renderer/
│           │   ├── index.mdx
│           │   ├── mount.md            # mount, render, unmountNode
│           │   ├── renderNodeToDOM.md
│           │   ├── renderElementToDOM.md
│           │   ├── domOps.md           # domOps, setDOMOps, resetDOMOps
│           │   ├── attributes.md       # applyAttributes
│           │   └── events.md           # bindEvents, bindEvent, isEventProp, toEventName
│           │
│           ├── hydration/
│           │   ├── index.mdx
│           │   ├── hydrate.md
│           │   └── hydrateIslands.md
│           │
│           ├── server/
│           │   ├── index.mdx
│           │   ├── renderToString.md
│           │   ├── renderPage.md
│           │   ├── registerPage.md
│           │   ├── getPage.md
│           │   ├── hasPage.md
│           │   ├── streamPage.md
│           │   ├── streamHydratablePage.md
│           │   ├── renderToHydratableString.md
│           │   ├── renderShell.md
│           │   └── streamShell.md
│           │
│           ├── react-compat/
│           │   ├── index.mdx
│           │   ├── interop.md          # zero react/react-dom dependency
│           │   ├── client/
│           │   │   ├── index.mdx      # sinwan/react-client subpath
│           │   │   ├── hooks/
│           │   │   │   ├── index.mdx
│           │   │   │   ├── useState.md
│           │   │   │   ├── useReducer.md
│           │   │   │   ├── useEffect.md
│           │   │   │   ├── useLayoutEffect.md
│           │   │   │   ├── useInsertionEffect.md
│           │   │   │   ├── useRef.md
│           │   │   │   ├── useMemo.md
│           │   │   │   ├── useCallback.md
│           │   │   │   ├── useContext.md
│           │   │   │   ├── useId.md
│           │   │   │   ├── useDebugValue.md
│           │   │   │   ├── useDeferredValue.md
│           │   │   │   ├── useImperativeHandle.md
│           │   │   │   ├── useSyncExternalStore.md
│           │   │   │   ├── useTransition.md
│           │   │   │   ├── useActionState.md
│           │   │   │   ├── useFormStatus.md
│           │   │   │   ├── useOptimistic.md
│           │   │   │   ├── useEffectEvent.md
│           │   │   │   ├── useTitle.md
│           │   │   │   └── use.md
│           │   │   ├── component/
│           │   │   │   ├── index.mdx
│           │   │   │   ├── Activity.md
│           │   │   │   ├── Fragment.md
│           │   │   │   ├── Profiler.md
│           │   │   │   ├── StrictMode.md
│           │   │   │   ├── Suspense.md
│           │   │   │   └── ViewTransition.md
│           │   │   ├── elements/
│           │   │   │   ├── index.mdx
│           │   │   │   ├── Form.md
│           │   │   │   ├── Input.md
│           │   │   │   ├── Button.md
│           │   │   │   ├── Select.md
│           │   │   │   ├── Textarea.md
│           │   │   │   ├── Option.md
│           │   │   │   ├── Progress.md
│           │   │   │   ├── Link.md
│           │   │   │   ├── Meta.md
│           │   │   │   ├── Script.md
│           │   │   │   ├── Style.md
│           │   │   │   └── Title.md
│           │   │   └── api/
│           │   │       ├── index.mdx
│           │   │       ├── act.md
│           │   │       ├── createContext.md
│           │   │       ├── createPortal.md
│           │   │       ├── createRoot.md
│           │   │       ├── flushSync.md
│           │   │       ├── hydrateRoot.md
│           │   │       ├── lazy.md
│           │   │       ├── memo.md
│           │   │       ├── preconnect.md
│           │   │       ├── prefetchDNS.md
│           │   │       ├── preload.md
│           │   │       ├── preloadModule.md
│           │   │       ├── preinit.md
│           │   │       ├── preinitModule.md
│           │   │       ├── startTransition.md
│           │   │       ├── cache.md
│           │   │       ├── cacheSignal.md
│           │   │       ├── addTransitionType.md
│           │   │       └── captureOwnerStack.md
│           │   ├── react-server/
│           │   │   ├── index.mdx        # sinwan/react-server subpath
│           │   │   ├── renderToString.md
│           │   │   ├── renderToStaticMarkup.md
│           │   │   ├── renderToReadableStream.md
│           │   │   ├── renderToPipeableStream.md
│           │   │   ├── resume.md
│           │   │   ├── renderShell.md
│           │   │   └── streamShell.md
│           │   └── static/
│           │       ├── index.mdx        # sinwan/react-static subpath
│           │       ├── prerender.md
│           │       └── resumeAndPrerender.md
│           │
│           ├── advanced/
│           │   ├── index.mdx
│           │   ├── state-and-context-patterns.md
│           │   ├── runtime-compat.md
│           │   ├── build-and-deploy.md
│           │   └── recipes.md
│           │
│           ├── reference/
│           │   ├── index.mdx
│           │   ├── api/
│           │   │   ├── index.mdx
│           │   │   ├── reactivity.md
│           │   │   ├── stores.md
│           │   │   ├── components.md
│           │   │   ├── lifecycle.md
│           │   │   ├── provide-inject.md
│           │   │   ├── jsx-runtime.md
│           │   │   ├── escaping.md
│           │   │   ├── renderer.md
│           │   │   ├── hydration.md
│           │   │   └── server.md
│           │   └── types/
│           │       ├── index.mdx
│           │       ├── core-jsx.md
│           │       ├── components.md
│           │       ├── reactivity.md
│           │       ├── lifecycle.md
│           │       ├── renderer-dom.md
│           │       ├── hydration.md
│           │       ├── escaping.md
│           │       └── jsx-namespace.md
│           │
│           └── changelog.md
│
└── public/
    └── images/

```

---

## Règles de nommage

- **Pas de numéros de préfixe** — l'ordre est défini dans `astro.config.mjs` (sidebar) ou par frontmatter (`sidebar.order`).
- **`index.mdx` par dossier** — overview + liens vers les sous-pages.
- **URLs stables** — une fois publiée, une URL ne change pas. Ex: `/core/getting-started/` reste valide en v1, v2, etc.

---

## Frontmatter standard

Chaque page `.mdx` doit contenir :

```mdx
---
title: "Titre de la page"
description: "Phrase pour SEO et cards sociales"
sidebar:
  order: 1 # ordre dans la section
  label: "Démarrage" # texte court dans la sidebar
draft: false
---
```

---

_Plan rédigé le 2026-05-11 — Option A validée._
