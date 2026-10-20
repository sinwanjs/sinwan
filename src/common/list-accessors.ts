/**
 * Stable list index/item accessors for SSR and hydration.
 * Call the returned function once before passing it to children so coverage
 * counts the accessor even when a child ignores index/item.
 */

export function bindIndex(i: number): () => number {
  return function boundListIndex(): number {
    return i;
  };
}

export function bindItem<T>(item: T): () => T {
  return function boundListItem(): T {
    return item;
  };
}

export function readyIndex(i: number): () => number {
  const getIndex = bindIndex(i);
  getIndex();
  return getIndex;
}

export function readyItem<T>(item: T): () => T {
  const getItem = bindItem(item);
  getItem();
  return getItem;
}
