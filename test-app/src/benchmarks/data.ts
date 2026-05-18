/**
 * Pre-generated, deterministic dataset.
 *
 * WHY deterministic:
 *  - Every framework (Sinwan, React, Solid, Vue, Svelte) must receive the
 *    exact same rows so that work is comparable.
 *  - Random generation MUST happen OUTSIDE the timed section. We build the
 *    full array up-front; timed code only shuffles references / mutates
 *    signals / applies updates.
 *
 * Follows the js-framework-benchmark (krausest) row format: numeric id +
 * adjective-color-noun label.
 */

export interface Row {
  id: number;
  label: string;
}

const ADJECTIVES = [
  "pretty", "large", "big", "small", "tall", "short", "long", "handsome",
  "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful",
  "mushy", "odd", "unsightly", "adorable", "important", "inexpensive",
  "cheap", "expensive", "fancy",
];
const COLOURS = [
  "red", "yellow", "blue", "green", "pink", "brown", "purple", "brown",
  "white", "black", "orange",
];
const NOUNS = [
  "table", "chair", "house", "bbq", "desk", "car", "pony", "cookie",
  "sandwich", "burger", "pizza", "mouse", "keyboard",
];

/**
 * Mulberry32 — tiny deterministic PRNG so every run yields identical data.
 * We DO NOT use Math.random anywhere in the benchmark path.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 1;

export function buildData(count: number, seed = 0x9e3779b9): Row[] {
  const rand = mulberry32(seed ^ count);
  const rows = new Array<Row>(count);
  for (let i = 0; i < count; i++) {
    const a = ADJECTIVES[(rand() * ADJECTIVES.length) | 0]!;
    const c = COLOURS[(rand() * COLOURS.length) | 0]!;
    const n = NOUNS[(rand() * NOUNS.length) | 0]!;
    rows[i] = { id: nextId++, label: `${a} ${c} ${n}` };
  }
  return rows;
}

export function resetIds(): void {
  nextId = 1;
}
