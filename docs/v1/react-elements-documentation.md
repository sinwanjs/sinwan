# Documentation des Éléments React Compatibles Sinwan

Cette documentation décrit les composants React-compatibles disponibles dans `src/integrations/react/elements.ts`. Ces wrappers fournissent une interface React pour les éléments HTML natifs de Sinwan avec des fonctionnalités supplémentaires.

## Vue d'ensemble

Les composants suivants sont disponibles :

- `Form` - Wrapper de formulaire avec support d'action
- `Input` - Wrapper d'input avec support contrôlé/non-contrôlé
- `Button` - Wrapper de bouton avec support formAction
- `Select` - Wrapper de sélection avec support contrôlé/non-contrôlé
- `Option` - Wrapper d'option pour Select
- `Textarea` - Wrapper de zone de texte avec support contrôlé/non-contrôlé
- `Link` - Wrapper de lien avec placement spécial dans `<head>`
- `Meta` - Wrapper de meta avec placement spécial dans `<head>`
- `Script` - Wrapper de script avec dé-duplication
- `Style` - Wrapper de style avec dé-duplication et précédence
- `Title` - Wrapper de titre avec placement dans `<head>`
- `Progress` - Wrapper de barre de progression

---

## Form

Wrapper React-compatible pour l'élément `<form>`.

### Fonctionnalités

- **Action string** : Soumission native du formulaire via le navigateur
- **Action fonction** : Intercepte la soumission, définit le statut du formulaire comme pending, exécute l'action, réinitialise le formulaire en cas de succès
- **Submitter formAction** : Les boutons/inputs avec `formAction` fonction peuvent surcharger l'action du formulaire

### Props

```typescript
interface FormActionProps {
  action?: string | ((formData: FormData) => void | Promise<void>);
  method?: string;
  encType?: string;
  onSubmit?: (event: SubmitEvent) => void;
  children?: SinwanNode;
  [key: string]: unknown;
}
```

### Exemple avec action fonction

```tsx
import { Form, Input, Button } from "sinwan/react-client";

function MyForm() {
  const handleSubmit = (formData: FormData) => {
    console.log("Form submitted:", formData);
    // Traiter les données du formulaire
  };

  return (
    <Form action={handleSubmit}>
      <Input type="text" name="username" required />
      <Input type="password" name="password" required />
      <Button type="submit">Envoyer</Button>
    </Form>
  );
}
```

### Exemple avec action string

```tsx
<Form action="/api/submit" method="post">
  <Input type="text" name="username" />
  <Button type="submit">Envoyer</Button>
</Form>
```

### Submitter formAction

```tsx
<Form action={defaultAction}>
  <Input type="text" name="username" />
  <Button type="submit">Action par défaut</Button>
  <Button 
    type="submit" 
    formAction={(formData) => console.log("Action custom:", formData)}
  >
    Action custom
  </Button>
</Form>
```

---

## Input

Wrapper React-compatible pour l'élément `<input>`.

### Fonctionnalités

- **Contrôlé** : Utilisez `value` ou `checked` avec des getters réactifs ou des valeurs plain
- **Non-contrôlé** : Utilisez `defaultValue` ou `defaultChecked`
- **FormAction** : Supporte les fonctions `formAction` pour les actions de soumission

### Props

```typescript
interface InputProps extends Record<string, unknown> {
  type?: string;
  value?: string | (() => string);
  defaultValue?: string;
  checked?: boolean | (() => boolean);
  defaultChecked?: boolean;
  readOnly?: boolean;
  onChange?: (event: Event) => void;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  children?: SinwanNode;
}
```

### Exemple contrôlé

```tsx
import { Input } from "sinwan/react-client";
import { signal } from "sinwan/reactivity";

function MyComponent() {
  const text = signal("");

  return (
    <Input
      type="text"
      value={text}
      onChange={(e) => text.value = e.currentTarget.value}
    />
  );
}
```

### Exemple non-contrôlé

```tsx
<Input type="text" defaultValue="Valeur initiale" name="username" />
```

### Exemple checkbox

```tsx
<Input type="checkbox" name="newsletter" defaultChecked={false} />
```

### Exemple radio

```tsx
<div>
  <Input type="radio" name="gender" value="male" />
  <Input type="radio" name="gender" value="female" />
</div>
```

### Exemple avec formAction

```tsx
<Input
  type="submit"
  formAction={(formData) => console.log("Submitted:", formData)}
  value="Soumettre"
/>
```

---

## Button

Wrapper React-compatible pour l'élément `<button>`.

### Fonctionnalités

- **FormAction** : Supporte les fonctions `formAction` pour surcharger l'action du formulaire parent

### Props

```typescript
interface ButtonProps extends Record<string, unknown> {
  type?: string;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  children?: SinwanNode;
}
```

### Exemple simple

```tsx
<Button type="submit">Envoyer</Button>
```

### Exemple avec formAction

```tsx
<Form action={defaultAction}>
  <Button type="submit">Action par défaut</Button>
  <Button 
    type="submit"
    formAction={(formData) => console.log("Custom action:", formData)}
  >
    Action custom
  </Button>
</Form>
```

---

## Select

Wrapper React-compatible pour l'élément `<select>`.

### Fonctionnalités

- **Contrôlé** : Utilisez `value` avec des getters réactifs ou des valeurs plain
- **Non-contrôlé** : Utilisez `defaultValue`
- **Multiple** : Supporte la sélection multiple via des tableaux

### Props

```typescript
interface SelectProps extends Record<string, unknown> {
  defaultValue?: string | string[];
  value?: string | string[] | (() => string | string[]);
  multiple?: boolean;
  children?: SinwanNode;
}
```

### Exemple non-contrôlé

```tsx
<Select name="country" defaultValue="fr">
  <Option value="fr">France</Option>
  <Option value="be">Belgique</Option>
  <Option value="ch">Suisse</Option>
</Select>
```

### Exemple contrôlé

```tsx
import { Select, Option } from "sinwan/react-client";
import { signal } from "sinwan/reactivity";

function MyComponent() {
  const country = signal("fr");

  return (
    <Select
      name="country"
      value={country}
      onChange={(e) => country.value = e.currentTarget.value}
    >
      <Option value="fr">France</Option>
      <Option value="be">Belgique</Option>
      <Option value="ch">Suisse</Option>
    </Select>
  );
}
```

### Exemple multiple

```tsx
<Select name="tags" defaultValue={["react", "typescript"]} multiple>
  <Option value="react">React</Option>
  <Option value="typescript">TypeScript</Option>
  <Option value="sinwan">Sinwan</Option>
</Select>
```

---

## Option

Wrapper React-compatible pour l'élément `<option>`.

### Fonctionnalités

- **Pas de selected** : La propriété `selected` n'est pas supportée. Utilisez la propriété `value` ou `defaultValue` du parent `<Select>` à la place.

### Props

```typescript
interface OptionProps extends Record<string, unknown> {
  disabled?: boolean;
  label?: string;
  value?: string | number;
  children?: SinwanNode;
}
```

### Exemple

```tsx
<Option value="fr">France</Option>
<Option value="be" label="Belgique" />
<Option value="ch" disabled>Suisse (non disponible)</Option>
```

---

## Textarea

Wrapper React-compatible pour l'élément `<textarea>`.

### Fonctionnalités

- **Contrôlé** : Utilisez `value` avec des getters réactifs ou des chaînes plain
- **Non-contrôlé** : Utilisez `defaultValue`
- **Pas d'enfants** : Les enfants ne sont pas acceptés, utilisez `defaultValue` pour la valeur initiale

### Props

```typescript
interface TextareaProps extends Record<string, unknown> {
  value?: string | (() => string);
  defaultValue?: string;
  children?: SinwanNode;
}
```

### Exemple contrôlé

```tsx
import { Textarea } from "sinwan/react-client";
import { signal } from "sinwan/reactivity";

function MyComponent() {
  const message = signal("");

  return (
    <Textarea
      value={message}
      onChange={(e) => message.value = e.currentTarget.value}
      rows={4}
    />
  );
}
```

### Exemple non-contrôlé

```tsx
<Textarea
  name="message"
  defaultValue="Votre message ici..."
  rows={4}
/>
```

---

## Link

Wrapper React-compatible pour l'élément `<link>`.

### Fonctionnalités

- **Stylesheets avec précédence** : Dé-duplication et insertion dans `document.head` selon l'ordre de précédence
- **Liens normaux** : Déplacés vers `document.head` sauf si marqués avec `itemProp` ou gérés manuellement
- **Dé-duplication** : Les stylesheets avec le même `href` ne sont insérés qu'une seule fois

### Props

```typescript
interface LinkProps extends Record<string, unknown> {
  rel?: string | (() => string);
  href?: string | (() => string);
  precedence?: string | (() => string);
  disabled?: boolean | (() => boolean);
  onError?: (event: Event) => void;
  onLoad?: (event: Event) => void;
  itemProp?: string;
  media?: string;
  title?: string;
  as?: string;
  [ autres props HTML standard... ]
}
```

### Exemple stylesheet avec précédence

```tsx
<Link
  rel="stylesheet"
  href="/styles/main.css"
  precedence="high"
/>
```

### Exemple stylesheet normal

```tsx
<Link rel="stylesheet" href="/styles/theme.css" />
```

### Exemple lien normal

```tsx
<Link rel="icon" href="/favicon.ico" />
```

### Exemple avec itemProp (pas de placement spécial)

```tsx
<Link rel="author" href="https://example.com" itemProp="author" />
```

---

## Meta

Wrapper React-compatible pour l'élément `<meta>`.

### Fonctionnalités

- **Placement dans head** : Rendu dans `document.head` sauf si `itemProp` est présent
- **Gestion automatique** : Ajouté au head au mount, retiré au unmount

### Props

```typescript
interface MetaProps extends Record<string, unknown> {
  name?: string;
  httpEquiv?: string;
  charset?: string;
  itemProp?: string;
  content?: string;
  children?: SinwanNode;
}
```

### Exemple

```tsx
<Meta name="description" content="Description de ma page" />
<Meta name="viewport" content="width=device-width, initial-scale=1" />
<Meta charset="UTF-8" />
```

### Exemple avec itemProp (pas de placement spécial)

```tsx
<Meta itemProp="name" content="Mon produit" />
```

---

## Script

Wrapper React-compatible pour l'élément `<script>`.

### Fonctionnalités

- **Scripts inline** : Rendu normal (pas de traitement spécial)
- **Scripts externes async** : Dé-duplication par `src` et placement dans `document.head`
- **Gestion manuelle** : Si `onLoad` ou `onError` sont présents, pas de traitement spécial

### Props

```typescript
interface ScriptProps extends Record<string, unknown> {
  src?: string | (() => string);
  async?: boolean | (() => boolean);
  children?: SinwanNode;
  onError?: (event: Event) => void;
  onLoad?: (event: Event) => crossOrigin?: string;
  fetchPriority?: string;
  integrity?: string;
  noModule?: boolean;
  nonce?: string;
  referrer?: string;
  type?: string;
  defer?: boolean;
  blocking?: string;
}
```

### Exemple inline

```tsx
<Script>{`console.log('Script inline exécuté');`}</Script>
```

### Exemple externe async (dé-duplication)

```tsx
<Script src="https://example.com/analytics.js" async />
```

### Exemple avec gestion manuelle

```tsx
<Script
  src="https://example.com/script.js"
  onLoad={() => console.log("Script chargé")}
  onError={() => console.log("Erreur de chargement")}
/>
```

---

## Style

Wrapper React-compatible pour l'élément `<style>`.

### Fonctionnalités

- **Avec href + precedence** : Dé-duplication par `href` et insertion dans `document.head` selon l'ordre de précédence
- **Sans href/precedence** : Rendu comme style inline normal

### Props

```typescript
interface StyleProps extends Record<string, unknown> {
  children?: SinwanNode;
  precedence?: string | (() => string);
  href?: string | (() => string);
  media?: string;
  nonce?: string;
  title?: string;
}
```

### Exemple inline

```tsx
<Style>{`
  body {
    background-color: #0b1020;
    color: white;
  }
`}</Style>
```

### Exemple avec href et precedence

```tsx
<Style href="/styles/main.css" precedence="high">
  {`/* Fallback CSS */`}
</Style>
```

---

## Title

Wrapper React-compatible pour l'élément `<title>`.

### Fonctionnalités

- **Placement dans head** : Rendu dans `document.head` sauf si `itemProp` est présent
- **Enfant unique** : Doit contenir un seul texte (utilisez l'interpolation de chaînes pour les variables)
- **Gestion automatique** : Ajouté au head au mount, retiré au unmount

### Props

```typescript
interface TitleProps extends Record<string, unknown> {
  children?: SinwanNode;
  itemProp?: string;
}
```

### Exemple

```tsx
<Title>Ma Page</Title>
```

### Exemple avec interpolation

```tsx
<Title>{`Résultats page ${pageNumber}`}</Title>
```

### Exemple avec itemProp (pas de placement spécial)

```tsx
<Title itemProp="name">Nom du produit</Title>
```

---

## Progress

Wrapper React-compatible pour l'élément `<progress>`.

### Fonctionnalités

- **Valeur null** : Omet l'attribut `value` pour produire une barre de progression indéterminée
- **Getters réactifs** : Supporte les getters réactifs pour `value` et `max`

### Props

```typescript
interface ProgressProps extends Record<string, unknown> {
  value?: number | null | (() => number | null);
  max?: number | (() => number);
  children?: SinwanNode;
}
```

### Exemple déterminé

```tsx
<Progress value={50} max={100} />
```

### Exemple indéterminé

```tsx
<Progress value={null} />
```

### Exemple avec getter réactif

```tsx
import { Progress } from "sinwan/react-client";
import { signal } from "sinwan/reactivity";

function MyComponent() {
  const progress = signal(0);

  // Simuler une progression
  setInterval(() => {
    progress.value = Math.min(progress.value + 10, 100);
  }, 1000);

  return <Progress value={progress} max={100} />;
}
```

---

## Bonnes Pratiques

### Formulaires

1. **Utilisez l'attribut `action` fonction** pour une gestion simplifiée de la soumission
2. **Utilisez `required`** sur les champs obligatoires au lieu de validation manuelle
3. **Les formulaires non-contrôlés** sont plus simples et recommandés pour la plupart des cas d'usage

### Éléments Contrôlés vs Non-Contrôlés

- **Non-contrôlé** (recommandé) : Utilisez `defaultValue`, `defaultChecked` - plus simple, moins de code
- **Contrôlé** : Utilisez `value`, `checked` - nécessaire pour une validation en temps réel ou des dépendances complexes

### Stylesheets

- Utilisez `precedence` pour contrôler l'ordre de chargement des stylesheets critiques
- Les stylesheets sont dé-dupliqués automatiquement par `href`

### Scripts

- Les scripts externes async sont dé-dupliqués automatiquement par `src`
- Utilisez `onLoad`/`onError` si vous avez besoin de gérer manuellement le chargement

---

## Compatibilité

- **SSR** : Tous les wrappers sont safe pour le rendu côté serveur
- **Réactivité** : Les wrappers comme `<Form>` mettent à jour les signaux de statut de formulaire
- **React** : Conçu pour être compatible avec les patterns React standards

---

## Notes Importantes

1. **Option.selected** n'est pas supporté - utilisez `Select.value` ou `Select.defaultValue`
2. **Textarea.children** n'est pas accepté - utilisez `defaultValue`
3. **Title** doit avoir un seul enfant texte - utilisez l'interpolation pour les variables
4. Les éléments head (`Link`, `Meta`, `Script`, `Style`, `Title`) sont gérés automatiquement sauf si `itemProp` est présent
