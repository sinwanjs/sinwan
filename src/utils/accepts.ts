import { lookup } from "./mime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Preference {
  value: string;
  quality: number;
  index: number;
}

interface NegotiatorLike {
  types(available?: string[]): string[] | string | false;
  encodings(available?: string[]): string[] | string | false;
  languages(available?: string[]): string[] | string | false;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated header into an ordered list of preferences sorted
 * by quality (`q=`) descending, then by appearance order.
 */
function parseHeader(header: string | null | undefined): Preference[] {
  if (!header) return [];

  const items: Preference[] = [];

  const parts = header.split(",");
  for (let i = 0; i < parts.length; i++) {
    const segments = parts[i].trim().split(";");
    const value = segments[0].trim().toLowerCase();
    if (!value) continue;

    let quality = 1;
    for (let j = 1; j < segments.length; j++) {
      const param = segments[j].trim();
      if (param.startsWith("q=")) {
        quality = Math.max(0, Math.min(1, parseFloat(param.slice(2)) || 0));
        break;
      }
    }

    items.push({ value, quality, index: i });
  }

  // Stable sort: quality desc, then original order asc
  items.sort((a, b) => b.quality - a.quality || a.index - b.index);

  return items;
}

/**
 * Normalise a type string to a full MIME type.
 * - `"json"` → `"application/json"`
 * - `"text/html"` → `"text/html"`
 */
function normaliseType(type: string): string {
  if (type.includes("/")) return type.toLowerCase();
  return (lookup(type) || type).toLowerCase();
}

/**
 * Check if a preference matches a given type (supports wildcards).
 */
function matchType(preference: string, type: string): boolean {
  if (preference === "*" || preference === "*/*") return true;

  const [prefMain, prefSub] = preference.split("/");
  const [typeMain, typeSub] = type.split("/");

  if (prefMain === typeMain) {
    if (!prefSub || prefSub === "*" || prefSub === typeSub) return true;

    // Handle suffixed types like "application/vnd.api+json" matching "application/json"
    if (typeSub && prefSub) {
      const suffixIndex = typeSub.lastIndexOf("+");
      if (suffixIndex !== -1 && typeSub.slice(suffixIndex + 1) === prefSub) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a preference matches a given encoding/language (supports wildcards).
 */
function matchSimple(preference: string, value: string): boolean {
  return preference === "*" || preference === value;
}

// ---------------------------------------------------------------------------
// Negotiation functions
// ---------------------------------------------------------------------------

function negotiateTypes(
  header: string | null | undefined,
  available?: string[],
): string[] | string | false {
  const preferences = parseHeader(header);
  if (preferences.length === 0 && !available) return ["*/*"];

  if (!available || available.length === 0) {
    // Return all accepted types in preference order (skip q=0)
    return preferences.filter((p) => p.quality > 0).map((p) => p.value);
  }

  const results: {
    type: string;
    quality: number;
    specificity: number;
    index: number;
  }[] = [];

  for (let i = 0; i < available.length; i++) {
    const normalised = normaliseType(available[i]);
    let bestQuality = 0;
    let bestSpecificity = -1;

    for (const pref of preferences) {
      if (matchType(pref.value, normalised)) {
        // Compute specificity: full match > subtype wildcard > full wildcard
        let specificity = 0;
        if (pref.value === "*" || pref.value === "*/*") specificity = 0;
        else if (pref.value.endsWith("/*")) specificity = 1;
        else specificity = 2;

        if (
          pref.quality > bestQuality ||
          (pref.quality === bestQuality && specificity > bestSpecificity)
        ) {
          bestQuality = pref.quality;
          bestSpecificity = specificity;
        }
      }
    }

    if (bestQuality > 0) {
      results.push({
        type: available[i],
        quality: bestQuality,
        specificity: bestSpecificity,
        index: i,
      });
    }
  }

  results.sort(
    (a, b) =>
      b.quality - a.quality ||
      b.specificity - a.specificity ||
      a.index - b.index,
  );

  return results.map((r) => r.type);
}

function negotiateSimple(
  header: string | null | undefined,
  available?: string[],
  fallback?: string,
): string[] | string | false {
  const preferences = parseHeader(header);

  if (!available || available.length === 0) {
    const vals = preferences.filter((p) => p.quality > 0).map((p) => p.value);
    return vals.length ? vals : fallback ? [fallback] : [];
  }

  const results: { value: string; quality: number; index: number }[] = [];

  for (let i = 0; i < available.length; i++) {
    const val = available[i].toLowerCase();
    let bestQuality = 0;

    for (const pref of preferences) {
      if (matchSimple(pref.value, val) && pref.quality > bestQuality) {
        bestQuality = pref.quality;
      }
    }

    if (bestQuality > 0) {
      results.push({ value: available[i], quality: bestQuality, index: i });
    }
  }

  results.sort((a, b) => b.quality - a.quality || a.index - b.index);

  return results.map((r) => r.value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a content-negotiation instance for the given request.
 *
 * The request must expose a `headers` property that is either a `Headers`
 * object or a plain object with header keys.
 */
export function accepts(req: {
  headers: Headers | Record<string, string | undefined>;
}): NegotiatorLike {
  const getHeader = (name: string): string | null | undefined => {
    if (req.headers instanceof Headers) {
      return req.headers.get(name);
    }
    return (req.headers as Record<string, string | undefined>)[name];
  };

  return {
    types(available?: string[]): string[] | string | false {
      const result = negotiateTypes(getHeader("accept"), available);
      if (Array.isArray(result) && result.length === 0) return false;
      return result;
    },

    encodings(available?: string[]): string[] | string | false {
      const result = negotiateSimple(
        getHeader("accept-encoding"),
        available,
        "identity",
      );
      if (Array.isArray(result) && result.length === 0) return false;
      return result;
    },

    languages(available?: string[]): string[] | string | false {
      const result = negotiateSimple(getHeader("accept-language"), available);
      if (Array.isArray(result) && result.length === 0) return false;
      return result;
    },
  };
}
