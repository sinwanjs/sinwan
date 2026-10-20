/**
 * Shared visible-window math for `<Virtual>` client / hydrate / SSR.
 */
export function computeVirtualWindow(options: {
  listLength: number;
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  minRendered: number;
  scrollTop: number;
}): { startIndex: number; endIndex: number } {
  const {
    listLength,
    itemHeight,
    containerHeight,
    overscan,
    minRendered,
    scrollTop,
  } = options;

  let startIndex = Math.floor(scrollTop / itemHeight);
  let endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);
  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(listLength, endIndex + overscan);

  if (minRendered > 0) {
    const visibleCount = endIndex - startIndex;
    if (visibleCount < minRendered) {
      const deficit = minRendered - visibleCount;
      const expandStart = Math.min(startIndex, Math.floor(deficit / 2));
      const expandEnd = Math.min(
        listLength - endIndex,
        Math.ceil(deficit / 2),
      );
      let remaining = deficit - expandStart - expandEnd;
      startIndex -= expandStart;
      endIndex += expandEnd;
      if (remaining > 0) {
        if (endIndex < listLength) {
          endIndex = Math.min(listLength, endIndex + remaining);
        } else if (startIndex > 0) {
          startIndex = Math.max(0, startIndex - remaining);
        }
      }
    }
  }

  return { startIndex, endIndex };
}
